"""Blender headless: modeli oyun üçün hazırlayır və GLB kimi ixrac edir.

İstifadə:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/prep_model.py -- \
      --in mənbə.glb --out çıxış.glb [--height 6.0] [--ratio 0.5] [--pivot bottom|center] [--thumb kadr.png]

Nə edir: idxal (glb/gltf/fbx/obj) → transformları tətbiq et → istəyə görə decimate →
istəyə görə hədəf hündürlüyə miqyasla → pivotu altına/mərkəzinə qoy → GLB ixrac →
üçbucaq/material hesabatı çap et → istəyə görə önizləmə kadrı.
"""
import sys
import argparse
import bpy
from mathutils import Vector


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='src', required=True)
    p.add_argument('--out', dest='dst', required=True)
    p.add_argument('--height', type=float, default=None, help='hədəf hündürlük (m)')
    p.add_argument('--ratio', type=float, default=None, help='decimate nisbəti 0..1')
    p.add_argument('--pivot', choices=['bottom', 'center', 'keep'], default='bottom')
    p.add_argument('--thumb', default=None, help='önizləmə PNG yolu')
    return p.parse_args(argv)


def import_model(path):
    low = path.lower()
    if low.endswith(('.glb', '.gltf')):
        bpy.ops.import_scene.gltf(filepath=path)
    elif low.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path)
    elif low.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise SystemExit(f'Dəstəklənməyən format: {path}')


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def tri_count(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        me = o.evaluated_get(deps).to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
    return n


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model(a.src)
    objs = meshes()
    if not objs:
        raise SystemExit('Mesh tapılmadı')
    before = tri_count(objs)

    if a.ratio and 0 < a.ratio < 1:
        for o in objs:
            m = o.modifiers.new('decimate', 'DECIMATE')
            m.ratio = a.ratio
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)

    # Kök obyektləri tap — miqyas və sürüşdürmə onlara tətbiq olunur
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    lo, hi = bounds(objs)
    size = hi - lo
    if a.height and size.z > 1e-6:
        k = a.height / size.z
        for r in roots:
            r.scale *= k
            r.location *= k
        bpy.context.view_layer.update()
        lo, hi = bounds(objs)
        size = hi - lo
    if a.pivot != 'keep':
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        cz = lo.z if a.pivot == 'bottom' else (lo.z + hi.z) / 2
        for r in roots:
            r.location -= Vector((cx, cy, cz))
        bpy.context.view_layer.update()

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=a.dst, export_format='GLB', export_apply=True, use_selection=True)

    after = tri_count(meshes())
    mats = {s.material.name for o in meshes() for s in o.material_slots if s.material}
    lo, hi = bounds(meshes())
    print(f'[prep] üçbucaq {before} → {after} | material {len(mats)} | '
          f'ölçü {hi.x - lo.x:.2f} × {hi.y - lo.y:.2f} × {hi.z - lo.z:.2f} m | → {a.dst}')

    if a.thumb:
        scene = bpy.context.scene
        cam_data = bpy.data.cameras.new('cam')
        cam = bpy.data.objects.new('cam', cam_data)
        scene.collection.objects.link(cam)
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 3.0
        sun.rotation_euler = (0.9, 0.2, 0.6)
        scene.collection.objects.link(sun)
        c = (lo + hi) / 2
        d = max((hi - lo).length, 0.5) * 1.4
        cam.location = c + Vector((d * 0.8, -d * 0.9, d * 0.55))
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
        scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [
            e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items
        ] else 'BLENDER_WORKBENCH'
        scene.render.resolution_x = 768
        scene.render.resolution_y = 768
        scene.render.film_transparent = False
        scene.render.filepath = a.thumb
        bpy.ops.render.render(write_still=True)
        print(f'[prep] önizləmə → {a.thumb}')


main()
