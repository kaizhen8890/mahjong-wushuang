package com.mahjongwushuang.table;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.util.Log;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.java_websocket.WebSocket;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshake;
import org.java_websocket.server.WebSocketServer;

/**
 * Local-network room transport for the table host and the lightweight player controller.
 *
 * <p>The JavaScript side owns Mahjong state. This plugin only discovers peers and moves bounded
 * UTF-8 messages between them. Keeping the transport state-free makes reconnection and future
 * protocol changes much easier to reason about.</p>
 */
@CapacitorPlugin(name = "LanRoom")
public class LanRoomPlugin extends Plugin {

    private static final String TAG = "MwsLanRoom";
    private static final String SERVICE_TYPE = "_mws-mahjong._tcp.";
    private static final int FIRST_PORT = 8765;
    private static final int LAST_PORT = 8785;
    private static final int MAX_PEERS = 8;
    private static final int MAX_FRAME_BYTES = 32 * 1024;
    private static final int START_TIMEOUT_SECONDS = 3;

    private final Object stateLock = new Object();
    private final Object peerAdmissionLock = new Object();
    private final Object nsdLock = new Object();
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private final ConcurrentHashMap<String, WebSocket> peerSockets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<WebSocket, String> peerIds = new ConcurrentHashMap<>();

    private NsdManager nsdManager;
    private WifiManager.MulticastLock multicastLock;
    private RoomWebSocketServer hostServer;
    private RemoteWebSocketClient remoteClient;
    private boolean hostStarting;

    private NsdManager.RegistrationListener registrationListener;
    private String registeredServiceName;

    private NsdManager.DiscoveryListener discoveryListener;
    private boolean discovering;
    private final Map<String, DiscoveredRoom> discoveredRooms = new HashMap<>();
    private final ArrayDeque<NsdServiceInfo> resolveQueue = new ArrayDeque<>();
    private final Set<String> resolvingNames = new HashSet<>();
    private final Set<String> lostNames = new HashSet<>();
    private boolean resolveInFlight;

    @Override
    public void load() {
        nsdManager = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
    }

    /** Start a WebSocket host on the first available port in 8765..8785 and advertise it by NSD. */
    @PluginMethod
    public void startHost(PluginCall call) {
        final String requestedName = sanitizeServiceName(call.getString("serviceName", "麻将无双房间"));
        Integer requestedPort = call.getInt("preferredPort", FIRST_PORT);
        final int preferredPort = requestedPort == null || requestedPort < FIRST_PORT || requestedPort > LAST_PORT
            ? FIRST_PORT
            : requestedPort;

        synchronized (stateLock) {
            if (hostServer != null) {
                call.resolve(hostResult(hostServer, true));
                return;
            }
            if (hostStarting) {
                call.reject("房间正在启动", "HOST_STARTING");
                return;
            }
            hostStarting = true;
        }

        ioExecutor.execute(() -> {
            RoomWebSocketServer startedServer = null;
            Exception lastError = null;

            try {
                int portCount = LAST_PORT - FIRST_PORT + 1;
                for (int offset = 0; offset < portCount; offset++) {
                    int port = FIRST_PORT + ((preferredPort - FIRST_PORT + offset) % portCount);
                    if (!isPortAvailable(port)) {
                        continue;
                    }

                    RoomWebSocketServer candidate = new RoomWebSocketServer(new InetSocketAddress("0.0.0.0", port));
                    try {
                        candidate.setReuseAddr(true);
                        candidate.setConnectionLostTimeout(20);
                        candidate.start();

                        if (candidate.awaitStarted(START_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                            startedServer = candidate;
                            break;
                        }

                        lastError = candidate.getStartupError();
                        candidate.stopQuietly();
                    } catch (Exception ex) {
                        lastError = ex;
                        candidate.stopQuietly();
                    }
                }

                if (startedServer == null) {
                    String detail = lastError == null ? "端口 8765–8785 均不可用" : safeMessage(lastError);
                    call.reject("无法启动局域网房间：" + detail, "HOST_START_FAILED");
                    return;
                }

                synchronized (stateLock) {
                    hostServer = startedServer;
                }

                registerHostService(requestedName, startedServer.getPort());
                call.resolve(hostResult(startedServer, true));
            } finally {
                synchronized (stateLock) {
                    hostStarting = false;
                }
            }
        });
    }

    /** Stop advertising and close all hosted peer connections. */
    @PluginMethod
    public void stopHost(PluginCall call) {
        RoomWebSocketServer server;
        synchronized (stateLock) {
            if (hostStarting && hostServer == null) {
                call.reject("房间仍在启动，请稍后重试", "HOST_STARTING");
                return;
            }
            server = hostServer;
            hostServer = null;
        }

        unregisterHostService();

        if (server == null) {
            call.resolve(new JSObject().put("stopped", false));
            return;
        }

        ioExecutor.execute(() -> {
            server.stopQuietly();
            peerSockets.clear();
            peerIds.clear();
            call.resolve(new JSObject().put("stopped", true));
        });
    }

    /** Begin Android NSD discovery. Results are returned now and subsequently by roomsChanged. */
    @PluginMethod
    public void discoverRooms(PluginCall call) {
        synchronized (nsdLock) {
            if (discovering) {
                call.resolve(roomsPayload(null));
                return;
            }
            if (nsdManager == null) {
                call.reject("此设备不支持局域网服务发现", "NSD_UNAVAILABLE");
                return;
            }

            discoveredRooms.clear();
            resolveQueue.clear();
            resolvingNames.clear();
            lostNames.clear();
            resolveInFlight = false;
            discovering = true;
            acquireMulticastLock();
            discoveryListener = createDiscoveryListener();

            try {
                nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
            } catch (RuntimeException ex) {
                discovering = false;
                discoveryListener = null;
                releaseMulticastLock();
                call.reject("无法开始搜索房间：" + safeMessage(ex), "DISCOVERY_START_FAILED", ex);
                return;
            }
        }

        call.resolve(roomsPayload(null));
    }

    /** Stop NSD and clear the current discovery result set. */
    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        boolean wasDiscovering = stopDiscoveryInternal(true);
        call.resolve(new JSObject().put("stopped", wasDiscovering));
    }

    /** Connect this app instance as a controller client. Accepts url, or host + port + path. */
    @PluginMethod
    public void connect(PluginCall call) {
        final URI uri;
        try {
            uri = connectionUri(call);
        } catch (Exception ex) {
            call.reject("房间地址无效：" + safeMessage(ex), "INVALID_ADDRESS", ex);
            return;
        }

        synchronized (stateLock) {
            if (remoteClient != null) {
                call.reject("已经连接或正在连接房间", "CLIENT_ALREADY_ACTIVE");
                return;
            }

            remoteClient = new RemoteWebSocketClient(uri);
            emitClientState(remoteClient, "connecting", null, null, null, false);
            try {
                remoteClient.connect();
            } catch (RuntimeException ex) {
                remoteClient = null;
                call.reject("无法连接房间：" + safeMessage(ex), "CLIENT_CONNECT_FAILED", ex);
                return;
            }
        }

        call.resolve(new JSObject().put("connecting", true).put("url", uri.toString()));
    }

    /** Disconnect the controller client without affecting a host running in the same app. */
    @PluginMethod
    public void disconnect(PluginCall call) {
        RemoteWebSocketClient client;
        synchronized (stateLock) {
            client = remoteClient;
            if (client == null) {
                call.resolve(new JSObject().put("disconnected", false));
                return;
            }
        }

        try {
            client.close(1000, "client_disconnect");
            call.resolve(new JSObject().put("disconnected", true));
        } catch (RuntimeException ex) {
            synchronized (stateLock) {
                if (remoteClient == client) {
                    remoteClient = null;
                }
            }
            call.reject("断开连接失败：" + safeMessage(ex), "CLIENT_DISCONNECT_FAILED", ex);
        }
    }

    /** Send one text frame from a controller client to its host. */
    @PluginMethod
    public void send(PluginCall call) {
        String message = requiredMessage(call);
        if (message == null || !validateOutboundMessage(call, message)) {
            return;
        }

        RemoteWebSocketClient client;
        synchronized (stateLock) {
            client = remoteClient;
        }

        if (client == null || !client.isOpen()) {
            call.reject("尚未连接房间", "CLIENT_NOT_CONNECTED");
            return;
        }

        try {
            client.send(message);
            call.resolve(sentResult(message, 1));
        } catch (RuntimeException ex) {
            call.reject("发送失败：" + safeMessage(ex), "SEND_FAILED", ex);
        }
    }

    /** Send one text frame from the host to one peer id obtained from peerOpened. */
    @PluginMethod
    public void sendTo(PluginCall call) {
        String peerId = call.getString("peerId");
        if (peerId == null) {
            peerId = call.getString("connectionId");
        }
        String message = requiredMessage(call);
        if (peerId == null || peerId.trim().isEmpty()) {
            call.reject("缺少 peerId", "PEER_ID_REQUIRED");
            return;
        }
        if (message == null || !validateOutboundMessage(call, message)) {
            return;
        }

        WebSocket socket = peerSockets.get(peerId);
        if (socket == null || !socket.isOpen()) {
            call.reject("目标玩家已离线", "PEER_NOT_CONNECTED");
            return;
        }

        try {
            socket.send(message);
            call.resolve(sentResult(message, 1).put("peerId", peerId));
        } catch (RuntimeException ex) {
            call.reject("发送失败：" + safeMessage(ex), "SEND_FAILED", ex);
        }
    }

    /** Broadcast one text frame from the host to every currently open peer. */
    @PluginMethod
    public void broadcast(PluginCall call) {
        String message = requiredMessage(call);
        if (message == null || !validateOutboundMessage(call, message)) {
            return;
        }

        int sent = 0;
        for (WebSocket socket : peerSockets.values()) {
            if (!socket.isOpen()) {
                continue;
            }
            try {
                socket.send(message);
                sent++;
            } catch (RuntimeException ex) {
                Log.w(TAG, "Broadcast to one peer failed", ex);
            }
        }
        call.resolve(sentResult(message, sent));
    }

    @Override
    protected void handleOnDestroy() {
        stopDiscoveryInternal(false);
        unregisterHostService();

        RemoteWebSocketClient client;
        RoomWebSocketServer server;
        synchronized (stateLock) {
            client = remoteClient;
            remoteClient = null;
            server = hostServer;
            hostServer = null;
        }

        if (client != null) {
            try {
                client.close();
            } catch (RuntimeException ignored) {}
        }
        if (server != null) {
            server.stopQuietly();
        }

        peerSockets.clear();
        peerIds.clear();
        ioExecutor.shutdownNow();
    }

    private final class RoomWebSocketServer extends WebSocketServer {

        private final CountDownLatch startedLatch = new CountDownLatch(1);
        private volatile boolean started;
        private volatile Exception startupError;

        RoomWebSocketServer(InetSocketAddress address) {
            super(
                address,
                Math.max(1, Math.min(2, Runtime.getRuntime().availableProcessors())),
                Collections.singletonList(new Draft_6455(Collections.emptyList(), MAX_FRAME_BYTES))
            );
        }

        boolean awaitStarted(long timeout, TimeUnit unit) {
            try {
                return startedLatch.await(timeout, unit) && started && startupError == null;
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                startupError = ex;
                return false;
            }
        }

        Exception getStartupError() {
            return startupError;
        }

        void stopQuietly() {
            try {
                stop(1000);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException ex) {
                Log.w(TAG, "Host stop failed", ex);
            }
        }

        @Override
        public void onStart() {
            started = true;
            startedLatch.countDown();
            Log.i(TAG, "Room host listening on " + getAddress());
        }

        @Override
        public void onOpen(WebSocket connection, ClientHandshake handshake) {
            String peerId;
            synchronized (peerAdmissionLock) {
                if (peerSockets.size() >= MAX_PEERS) {
                    connection.close(1008, "room_full");
                    return;
                }
                peerId = UUID.randomUUID().toString();
                peerSockets.put(peerId, connection);
                peerIds.put(connection, peerId);
            }

            InetSocketAddress remoteAddress = connection.getRemoteSocketAddress();
            JSObject data = new JSObject()
                .put("peerId", peerId)
                .put("connectionId", peerId)
                .put("address", addressHost(remoteAddress))
                .put("remoteAddress", addressHost(remoteAddress))
                .put("port", remoteAddress == null ? 0 : remoteAddress.getPort())
                .put("path", handshake == null ? "/" : handshake.getResourceDescriptor())
                .put("connectedPeers", peerSockets.size());
            emit("peerOpened", data);
        }

        @Override
        public void onClose(WebSocket connection, int code, String reason, boolean remote) {
            String peerId = peerIds.remove(connection);
            if (peerId != null) {
                peerSockets.remove(peerId, connection);
                emit(
                    "peerClosed",
                    new JSObject()
                        .put("peerId", peerId)
                        .put("connectionId", peerId)
                        .put("remoteAddress", addressHost(connection.getRemoteSocketAddress()))
                        .put("code", code)
                        .put("reason", reason == null ? "" : reason)
                        .put("remote", remote)
                        .put("connectedPeers", peerSockets.size())
                );
            }
        }

        @Override
        public void onMessage(WebSocket connection, String message) {
            String peerId = peerIds.get(connection);
            if (peerId == null) {
                connection.close(1008, "unknown_peer");
                return;
            }

            int bytes = utf8Bytes(message);
            if (bytes > MAX_FRAME_BYTES) {
                connection.close(1009, "frame_too_large");
                return;
            }

            emit(
                "peerMessage",
                new JSObject()
                    .put("peerId", peerId)
                    .put("connectionId", peerId)
                    .put("message", message)
                    .put("text", message)
                    .put("bytes", bytes)
            );
        }

        @Override
        public void onMessage(WebSocket connection, ByteBuffer message) {
            connection.close(1003, message.remaining() > MAX_FRAME_BYTES ? "frame_too_large" : "binary_not_supported");
        }

        @Override
        public void onError(WebSocket connection, Exception ex) {
            if (!started) {
                startupError = ex;
                startedLatch.countDown();
            }
            Log.w(TAG, "Host WebSocket error", ex);
        }
    }

    private final class RemoteWebSocketClient extends WebSocketClient {

        RemoteWebSocketClient(URI uri) {
            super(uri, new Draft_6455(Collections.emptyList(), MAX_FRAME_BYTES));
            setConnectionLostTimeout(20);
        }

        @Override
        public void onOpen(ServerHandshake handshake) {
            if (isCurrentClient(this)) {
                emitClientState(this, "connected", null, null, null, false);
            }
        }

        @Override
        public void onMessage(String message) {
            if (!isCurrentClient(this)) {
                return;
            }
            int bytes = utf8Bytes(message);
            if (bytes > MAX_FRAME_BYTES) {
                close(1009, "frame_too_large");
                return;
            }
            emit("clientMessage", new JSObject().put("message", message).put("text", message).put("bytes", bytes));
        }

        @Override
        public void onMessage(ByteBuffer message) {
            close(1003, message.remaining() > MAX_FRAME_BYTES ? "frame_too_large" : "binary_not_supported");
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            boolean current;
            synchronized (stateLock) {
                current = remoteClient == this;
                if (current) {
                    remoteClient = null;
                }
            }
            if (current) {
                emitClientState(this, "disconnected", code, reason, null, remote);
            }
        }

        @Override
        public void onError(Exception ex) {
            if (isCurrentClient(this)) {
                emitClientState(this, "error", null, null, safeMessage(ex), false);
            }
            Log.w(TAG, "Client WebSocket error", ex);
        }
    }

    private NsdManager.DiscoveryListener createDiscoveryListener() {
        return new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String serviceType) {
                emit("roomsChanged", roomsPayload(null));
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (!matchesServiceType(serviceInfo.getServiceType())) {
                    return;
                }
                enqueueResolve(serviceInfo);
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                String name = serviceInfo.getServiceName();
                boolean changed;
                synchronized (nsdLock) {
                    lostNames.add(name);
                    changed = discoveredRooms.remove(name) != null;
                    resolveQueue.removeIf(info -> name.equals(info.getServiceName()));
                }
                if (changed) {
                    emit("roomsChanged", roomsPayload(null));
                }
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                synchronized (nsdLock) {
                    discovering = false;
                }
                releaseMulticastLock();
                emit("roomsChanged", roomsPayload(null));
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                discoveryFailed(this, "start", errorCode);
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                discoveryFailed(this, "stop", errorCode);
            }
        };
    }

    private void enqueueResolve(NsdServiceInfo serviceInfo) {
        boolean shouldResolve = false;
        synchronized (nsdLock) {
            if (!discovering) {
                return;
            }
            String name = serviceInfo.getServiceName();
            lostNames.remove(name);
            if (!discoveredRooms.containsKey(name) && !resolvingNames.contains(name)) {
                resolvingNames.add(name);
                resolveQueue.add(serviceInfo);
            }
            if (!resolveInFlight && !resolveQueue.isEmpty()) {
                shouldResolve = true;
            }
        }
        if (shouldResolve) {
            resolveNextService();
        }
    }

    @SuppressWarnings("deprecation")
    private void resolveNextService() {
        final NsdServiceInfo serviceInfo;
        synchronized (nsdLock) {
            if (!discovering || resolveInFlight || resolveQueue.isEmpty()) {
                return;
            }
            serviceInfo = resolveQueue.removeFirst();
            resolveInFlight = true;
        }

        try {
            nsdManager.resolveService(
                serviceInfo,
                new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo failedInfo, int errorCode) {
                        finishResolve(serviceInfo.getServiceName(), null);
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo resolvedInfo) {
                        finishResolve(serviceInfo.getServiceName(), discoveredRoom(resolvedInfo));
                    }
                }
            );
        } catch (RuntimeException ex) {
            Log.w(TAG, "NSD resolve failed", ex);
            finishResolve(serviceInfo.getServiceName(), null);
        }
    }

    private void finishResolve(String requestedName, DiscoveredRoom room) {
        boolean changed = false;
        boolean continueResolving;
        synchronized (nsdLock) {
            resolvingNames.remove(requestedName);
            resolveInFlight = false;
            if (discovering && room != null && !lostNames.contains(requestedName)) {
                DiscoveredRoom oldRoom = discoveredRooms.put(room.serviceName, room);
                changed = !room.equals(oldRoom);
            }
            continueResolving = discovering && !resolveQueue.isEmpty();
        }
        if (changed) {
            emit("roomsChanged", roomsPayload(null));
        }
        if (continueResolving) {
            resolveNextService();
        }
    }

    private void discoveryFailed(NsdManager.DiscoveryListener listener, String operation, int errorCode) {
        synchronized (nsdLock) {
            discovering = false;
            discoveryListener = null;
            discoveredRooms.clear();
            resolveQueue.clear();
            resolvingNames.clear();
            resolveInFlight = false;
        }
        try {
            nsdManager.stopServiceDiscovery(listener);
        } catch (RuntimeException ignored) {}
        releaseMulticastLock();
        emit("roomsChanged", roomsPayload("NSD " + operation + " failed: " + errorCode));
    }

    private boolean stopDiscoveryInternal(boolean emitChange) {
        NsdManager.DiscoveryListener listener;
        synchronized (nsdLock) {
            if (!discovering || discoveryListener == null) {
                discoveredRooms.clear();
                releaseMulticastLock();
                return false;
            }
            listener = discoveryListener;
            discoveryListener = null;
            discovering = false;
            discoveredRooms.clear();
            resolveQueue.clear();
            resolvingNames.clear();
            lostNames.clear();
            resolveInFlight = false;
        }

        try {
            nsdManager.stopServiceDiscovery(listener);
        } catch (RuntimeException ex) {
            Log.w(TAG, "NSD stop failed", ex);
        }
        releaseMulticastLock();
        if (emitChange) {
            emit("roomsChanged", roomsPayload(null));
        }
        return true;
    }

    private void registerHostService(String serviceName, int port) {
        if (nsdManager == null) {
            return;
        }
        unregisterHostService();

        NsdServiceInfo serviceInfo = new NsdServiceInfo();
        serviceInfo.setServiceName(serviceName);
        serviceInfo.setServiceType(SERVICE_TYPE);
        serviceInfo.setPort(port);
        try {
            serviceInfo.setAttribute("protocol", "1");
            serviceInfo.setAttribute("app", "mahjong-wushuang");
        } catch (IllegalArgumentException ex) {
            Log.w(TAG, "NSD TXT attributes rejected", ex);
        }

        NsdManager.RegistrationListener listener = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo registeredInfo) {
                synchronized (nsdLock) {
                    if (registrationListener != this) {
                        return;
                    }
                    registeredServiceName = registeredInfo.getServiceName();
                }
                Log.i(TAG, "NSD service registered as " + registeredInfo.getServiceName());
            }

            @Override
            public void onRegistrationFailed(NsdServiceInfo failedInfo, int errorCode) {
                synchronized (nsdLock) {
                    if (registrationListener == this) {
                        registrationListener = null;
                        registeredServiceName = null;
                    }
                }
                Log.w(TAG, "NSD registration failed: " + errorCode);
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo unregisteredInfo) {
                synchronized (nsdLock) {
                    if (registrationListener == this) {
                        registrationListener = null;
                        registeredServiceName = null;
                    }
                }
                Log.i(TAG, "NSD service unregistered");
            }

            @Override
            public void onUnregistrationFailed(NsdServiceInfo failedInfo, int errorCode) {
                Log.w(TAG, "NSD unregistration failed: " + errorCode);
            }
        };

        synchronized (nsdLock) {
            registrationListener = listener;
            registeredServiceName = serviceName;
        }

        try {
            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, listener);
        } catch (RuntimeException ex) {
            synchronized (nsdLock) {
                if (registrationListener == listener) {
                    registrationListener = null;
                    registeredServiceName = null;
                }
            }
            Log.w(TAG, "Could not register NSD service", ex);
        }
    }

    private void unregisterHostService() {
        NsdManager.RegistrationListener listener;
        synchronized (nsdLock) {
            listener = registrationListener;
            registrationListener = null;
            registeredServiceName = null;
        }
        if (listener == null || nsdManager == null) {
            return;
        }
        try {
            nsdManager.unregisterService(listener);
        } catch (RuntimeException ex) {
            Log.w(TAG, "Could not unregister NSD service", ex);
        }
    }

    private void acquireMulticastLock() {
        if (multicastLock != null && multicastLock.isHeld()) {
            return;
        }
        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) {
            return;
        }
        try {
            multicastLock = wifiManager.createMulticastLock("mws-lan-room-discovery");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        } catch (RuntimeException ex) {
            multicastLock = null;
            Log.w(TAG, "Could not acquire multicast lock", ex);
        }
    }

    private void releaseMulticastLock() {
        WifiManager.MulticastLock lock = multicastLock;
        multicastLock = null;
        if (lock == null) {
            return;
        }
        try {
            if (lock.isHeld()) {
                lock.release();
            }
        } catch (RuntimeException ex) {
            Log.w(TAG, "Could not release multicast lock", ex);
        }
    }

    private DiscoveredRoom discoveredRoom(NsdServiceInfo serviceInfo) {
        String host = resolvedIpv4(serviceInfo);
        int port = serviceInfo.getPort();
        if (host == null || port < FIRST_PORT || port > LAST_PORT) {
            return null;
        }

        String protocol = textAttribute(serviceInfo, "protocol");
        return new DiscoveredRoom(serviceInfo.getServiceName(), host, port, protocol == null ? "1" : protocol);
    }

    @SuppressWarnings("deprecation")
    private static String resolvedIpv4(NsdServiceInfo serviceInfo) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                for (InetAddress address : serviceInfo.getHostAddresses()) {
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
            InetAddress address = serviceInfo.getHost();
            if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                return address.getHostAddress();
            }
        } catch (RuntimeException ex) {
            Log.w(TAG, "Could not read resolved NSD address", ex);
        }
        return null;
    }

    private static String textAttribute(NsdServiceInfo serviceInfo, String name) {
        try {
            byte[] value = serviceInfo.getAttributes().get(name);
            return value == null ? null : new String(value, StandardCharsets.UTF_8);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private JSObject roomsPayload(String error) {
        List<DiscoveredRoom> snapshot;
        boolean isDiscovering;
        synchronized (nsdLock) {
            snapshot = new ArrayList<>(discoveredRooms.values());
            isDiscovering = discovering;
        }
        snapshot.sort(Comparator.comparing(room -> room.serviceName));

        JSArray rooms = new JSArray();
        for (DiscoveredRoom room : snapshot) {
            rooms.put(room.toJson());
        }
        JSObject payload = new JSObject().put("discovering", isDiscovering).put("rooms", rooms);
        if (error != null) {
            payload.put("error", error);
        }
        return payload;
    }

    private JSObject hostResult(RoomWebSocketServer server, boolean started) {
        String localIp = findLocalIpv4();
        String serviceName;
        synchronized (nsdLock) {
            serviceName = registeredServiceName;
        }
        if (serviceName == null) {
            serviceName = "麻将无双房间";
        }

        return new JSObject()
            .put("started", started)
            .put("serviceName", serviceName)
            .put("serviceType", SERVICE_TYPE)
            .put("host", localIp == null ? "" : localIp)
            .put("localIp", localIp == null ? "" : localIp)
            .put("port", server.getPort())
            .put("url", localIp == null ? "" : wsUrl(localIp, server.getPort()))
            .put("maxPeers", MAX_PEERS)
            .put("maxFrameBytes", MAX_FRAME_BYTES);
    }

    private static boolean isPortAvailable(int port) {
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(false);
            socket.bind(new InetSocketAddress("0.0.0.0", port));
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private URI connectionUri(PluginCall call) throws Exception {
        String providedUrl = call.getString("url");
        URI uri;
        if (providedUrl != null && !providedUrl.trim().isEmpty()) {
            uri = new URI(providedUrl.trim());
        } else {
            String host = call.getString("host");
            Integer requestedPort = call.getInt("port", FIRST_PORT);
            String path = call.getString("path", "/");
            if (host == null || host.trim().isEmpty()) {
                throw new IllegalArgumentException("缺少 host 或 url");
            }
            int port = requestedPort == null ? FIRST_PORT : requestedPort;
            if (port < FIRST_PORT || port > LAST_PORT) {
                throw new IllegalArgumentException("端口必须位于 8765–8785");
            }
            if (path == null || path.isEmpty()) {
                path = "/";
            } else if (!path.startsWith("/")) {
                path = "/" + path;
            }
            uri = new URI("ws", null, host.trim(), port, path, null, null);
        }

        String scheme = uri.getScheme();
        if (scheme == null || (!"ws".equalsIgnoreCase(scheme) && !"wss".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException("仅支持 ws:// 或 wss:// 地址");
        }
        if (uri.getHost() == null || uri.getHost().isEmpty()) {
            throw new IllegalArgumentException("地址中缺少主机");
        }
        int port = uri.getPort();
        if (port < FIRST_PORT || port > LAST_PORT) {
            throw new IllegalArgumentException("端口必须位于 8765–8785");
        }
        return uri;
    }

    private static String requiredMessage(PluginCall call) {
        String message = call.getString("message");
        if (message == null) {
            message = call.getString("text");
        }
        if (message == null) {
            call.reject("缺少 message/text", "MESSAGE_REQUIRED");
        }
        return message;
    }

    private static boolean validateOutboundMessage(PluginCall call, String message) {
        int bytes = utf8Bytes(message);
        if (bytes > MAX_FRAME_BYTES) {
            call.reject("消息超过 32KB 单帧限制", "FRAME_TOO_LARGE");
            return false;
        }
        return true;
    }

    private static JSObject sentResult(String message, int count) {
        return new JSObject().put("sent", count > 0).put("count", count).put("bytes", utf8Bytes(message));
    }

    private boolean isCurrentClient(RemoteWebSocketClient client) {
        synchronized (stateLock) {
            return remoteClient == client;
        }
    }

    private void emitClientState(
        RemoteWebSocketClient client,
        String state,
        Integer code,
        String reason,
        String error,
        boolean remote
    ) {
        JSObject data = new JSObject().put("state", state).put("url", client.getURI().toString()).put("remote", remote);
        if (code != null) {
            data.put("code", code);
        }
        if (reason != null) {
            data.put("reason", reason);
            data.put("message", reason);
        }
        if (error != null) {
            data.put("error", error);
            data.put("message", error);
        }
        emit("clientState", data);
    }

    private void emit(String eventName, JSObject data) {
        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        bridge.execute(() -> notifyListeners(eventName, data));
    }

    private String findLocalIpv4() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager != null) {
                for (Network network : manager.getAllNetworks()) {
                    NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
                    if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        String address = ipv4FromLinkProperties(manager.getLinkProperties(network));
                        if (address != null) {
                            return address;
                        }
                    }
                }
                Network activeNetwork = manager.getActiveNetwork();
                if (activeNetwork != null) {
                    String activeAddress = ipv4FromLinkProperties(manager.getLinkProperties(activeNetwork));
                    if (activeAddress != null) {
                        return activeAddress;
                    }
                }
            }

            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();
                if (!networkInterface.isUp() || networkInterface.isLoopback()) {
                    continue;
                }
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress() && address.isSiteLocalAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ex) {
            Log.w(TAG, "Could not determine LAN IPv4 address", ex);
        }
        return null;
    }

    private static String ipv4FromLinkProperties(LinkProperties properties) {
        if (properties == null) {
            return null;
        }
        for (LinkAddress linkAddress : properties.getLinkAddresses()) {
            InetAddress address = linkAddress.getAddress();
            if (address instanceof Inet4Address && !address.isLoopbackAddress() && address.isSiteLocalAddress()) {
                return address.getHostAddress();
            }
        }
        return null;
    }

    private static String sanitizeServiceName(String value) {
        String source = value == null ? "" : value.trim();
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < source.length(); index++) {
            char character = source.charAt(index);
            if (!Character.isISOControl(character) && character != '/' && character != '\\') {
                result.append(character);
            }
        }
        if (result.length() == 0) {
            result.append("麻将无双房间");
        }
        while (result.toString().getBytes(StandardCharsets.UTF_8).length > 48) {
            result.deleteCharAt(result.length() - 1);
        }
        return result.toString();
    }

    private static boolean matchesServiceType(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.endsWith(".") ? value : value + ".";
        return SERVICE_TYPE.equalsIgnoreCase(normalized);
    }

    private static int utf8Bytes(String message) {
        return message.getBytes(StandardCharsets.UTF_8).length;
    }

    private static String wsUrl(String host, int port) {
        String formattedHost = host.contains(":") ? "[" + host + "]" : host;
        return "ws://" + formattedHost + ":" + port + "/";
    }

    private static String addressHost(InetSocketAddress address) {
        if (address == null) {
            return "";
        }
        InetAddress inetAddress = address.getAddress();
        return inetAddress == null ? address.getHostString() : inetAddress.getHostAddress();
    }

    private static String safeMessage(Throwable throwable) {
        String message = throwable == null ? null : throwable.getMessage();
        return message == null || message.trim().isEmpty() ? throwable.getClass().getSimpleName() : message;
    }

    private static final class DiscoveredRoom {

        final String serviceName;
        final String host;
        final int port;
        final String protocol;

        DiscoveredRoom(String serviceName, String host, int port, String protocol) {
            this.serviceName = serviceName;
            this.host = host;
            this.port = port;
            this.protocol = protocol;
        }

        JSObject toJson() {
            return new JSObject()
                .put("serviceName", serviceName)
                .put("host", host)
                .put("port", port)
                .put("url", wsUrl(host, port))
                .put("protocol", protocol);
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof DiscoveredRoom)) {
                return false;
            }
            DiscoveredRoom room = (DiscoveredRoom) other;
            return port == room.port && serviceName.equals(room.serviceName) && host.equals(room.host) && protocol.equals(room.protocol);
        }

        @Override
        public int hashCode() {
            int result = serviceName.hashCode();
            result = 31 * result + host.hashCode();
            result = 31 * result + port;
            result = 31 * result + protocol.hashCode();
            return result;
        }
    }
}
