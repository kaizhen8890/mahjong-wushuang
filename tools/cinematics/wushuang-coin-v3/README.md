# Decision coin v3 production

Blender 4.5.9, Python 3 with NumPy/Pillow, and FFmpeg are used. No externally sourced images or audio.

`build_scene.py` creates the preserved v1 shrine/coin base. Supply `--font /path/to/Wushuang-Jianghu.ttf` for the project's Jianghu font and `--save-only` to save the base; `--portrait` and `--result heads|tails` choose the shape and face. The saved v3 scenes include that font.

Load the corresponding base .blend in Blender and run `upgrade_scene.py -- --out OUTPUT --result heads|tails [--portrait]`. It retimes the base props, fully rebuilds the camera and coin actions, adds temporal rim trails, and saves a 300-frame scene. This script expects a v1 base, not a previously upgraded v3 scene.

`motion.py` owns the flight, angular brake, rebound, shot timing and scene-unit gravity. Gravity alone does not stop spin; the apex brake is intentional. The fall is a constant-gravity ballistic trajectory with no horizontal drift. Landing is authored rather than a full rigid-body simulation.

For a complete fresh render, load a delivered scene and run `render_saved.py -- --out OUTPUT/SHAPE-FACE/frames --start 1 --end 300 --scale 100 --samples 32`. The first 196 source frames are common to both outcomes for each shape. `encode.py --source OUTPUT --output MEDIA --ffmpeg FFMPEG` synthesizes stereo sound and encodes all four films plus posters and a SHA-256 manifest.

The delivered source-frame assembly reuses unmodified v1 opening frames 1–88 and final frames 332–390 (mapped to 242–300); all intervening footage is re-rendered. Host-supplied results remain authoritative. No random outcome or game mutation occurs in media generation.
