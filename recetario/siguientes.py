# Lista los siguientes platos del índice (platos.json) que aún no tienen receta, repartidos por tipo,
# y las unidades ya usadas de cada ingrediente (para escribir la tanda siguiente sin contradecirlas).
# Uso: python3 recetario/siguientes.py 50
import glob, json, os, sys
from construir import slug
AQUI = os.path.dirname(os.path.abspath(__file__))
n = int(sys.argv[1]) if len(sys.argv) > 1 else 50
hechas = [r for ruta in glob.glob(os.path.join(AQUI, 'tanda-*.json')) for r in json.load(open(ruta, encoding='utf-8'))]
ya = {slug(r['nombre']) for r in hechas}
por_tipo = {}
for p in json.load(open(os.path.join(AQUI, 'platos.json'), encoding='utf-8')):
    if slug(p['nombre']) not in ya:
        por_tipo.setdefault(p['tipo'], []).append(p['nombre'])
salida = []
while len(salida) < n and any(por_tipo.values()):
    for t, l in por_tipo.items():
        if l and len(salida) < n:
            salida.append((t, l.pop(0)))
print(f'Hechas {len(ya)}; faltan {sum(len(l) for l in por_tipo.values()) + len(salida)}')
for t, nombre in salida:
    print(f'{t}: {nombre}')
if '--unidades' in sys.argv:
    u = {}
    for r in hechas:
        for i in r['ingredientes']:
            u.setdefault(i[0], i[2])
    print('; '.join(f'{k}|{v}' for k, v in sorted(u.items())))
