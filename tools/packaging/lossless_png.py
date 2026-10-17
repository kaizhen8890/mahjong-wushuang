"""Optional package-only PNG optimization. No resampling or pixel conversion.

Run after the web build and asset pruning, before the offline manifest and
Capacitor sync. Uses only Python's standard library. All non-IDAT chunks,
including color profiles and transparency, remain byte-for-byte unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'

def optimize(data):
    if not data.startswith(SIGNATURE):
        raise ValueError('Invalid PNG signature')
    chunks = []
    offset = 8
    while offset < len(data):
        size = struct.unpack_from('>I', data, offset)[0]
        end = offset + size + 12
        if end > len(data):
            raise ValueError('Truncated PNG chunk')
        kind = data[offset+4:offset+8]
        payload = data[offset+8:offset+8+size]
        crc = struct.unpack_from('>I', data, offset+8+size)[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            raise ValueError('Invalid PNG CRC')
        chunks.append((kind, payload, data[offset:end]))
        offset = end
    if chunks[-1][0] != b'IEND':
        raise ValueError('Missing PNG end')
    # Skip animated PNGs: their frame streams need a separate optimizer.
    if any(kind == b'acTL' for kind, _, _ in chunks):
        return data, None
    filtered_pixels = zlib.decompress(b''.join(payload for kind, payload, _ in chunks if kind == b'IDAT'))
    compressed = zlib.compress(filtered_pixels, 9)
    assert zlib.decompress(compressed) == filtered_pixels
    replacement = (struct.pack('>I', len(compressed)) + b'IDAT' + compressed
                   + struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff))
    output = [SIGNATURE]
    inserted = False
    for kind, _, raw in chunks:
        if kind == b'IDAT':
            if not inserted:
                output.append(replacement)
                inserted = True
        else:
            output.append(raw)
    candidate = b''.join(output)
    return (candidate if len(candidate) < len(data) else data), hashlib.sha256(filtered_pixels).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve(strict=True)
    if root.parts[-2:] != ('dist', 'client'):
        raise ValueError('Only generated dist/client assets may be optimized')
    entries = []
    for file in sorted(root.rglob('*.png')):
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError('Unexpected asset link')
        original = file.read_bytes()
        candidate, pixel_hash = optimize(original)
        if candidate != original:
            file.write_bytes(candidate)
        entries.append({'file':file.relative_to(root).as_posix(), 'before':len(original),
                        'after':len(candidate), 'saved':len(original)-len(candidate),
                        'filteredPixelSha256':pixel_hash,
                        'sourceSha256':hashlib.sha256(original).hexdigest(),
                        'packageSha256':hashlib.sha256(candidate).hexdigest()})
    report = {'lossless':True, 'method':'Recompress PNG IDAT only; all filtered scanlines and other chunks identical',
              'files':entries, 'savedBytes':sum(e['saved'] for e in entries)}
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"PNG optimization: {len(entries)} files, {report['savedBytes']} bytes saved; scanlines unchanged.")

if __name__ == '__main__':
    main()
