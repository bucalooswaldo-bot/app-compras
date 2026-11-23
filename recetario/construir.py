# Junta las tandas de recetas del recetario de la app (recetario/tanda-*.json) en web/recetario.json,
# que es lo que carga la app. Comprueba cada receta y le pone un id fijo (sacado del nombre).
# Uso: python3 recetario/construir.py
import glob, json, os, re, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'web', 'recetario.json')
UNIDADES = {'g', 'ml', 'ud'}
DIFICULTAD = {'fácil', 'media', 'difícil'}
COSTE = {'bajo', 'medio', 'alto'}


def slug(texto):
    t = unicodedata.normalize('NFD', texto.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def comprobar(r, donde):
    fallos = []
    for campo in ('nombre', 'tipo', 'raciones', 'tiempo_min', 'ingredientes', 'pasos'):
        if not r.get(campo):
            fallos.append(f'falta {campo}')
    if r.get('dificultad') and r['dificultad'] not in DIFICULTAD:
        fallos.append(f"dificultad rara: {r['dificultad']}")
    if r.get('coste') and r['coste'] not in COSTE:
        fallos.append(f"coste raro: {r['coste']}")
    for i in r.get('ingredientes', []):
        if len(i) != 3 or not i[0] or i[2] not in UNIDADES or not (i[1] is None or (isinstance(i[1], (int, float)) and i[1] > 0)):
            fallos.append(f'ingrediente mal: {i}')
    if not isinstance(r.get('pasos'), list) or not all(isinstance(p, str) and p.strip() for p in r.get('pasos', [])):
        fallos.append('pasos mal')
    return [f"{donde} «{r.get('nombre', '?')}»: {f}" for f in fallos]


def main():
    recetas, fallos, vistos = [], [], {}
    for ruta in sorted(glob.glob(os.path.join(AQUI, 'tanda-*.json'))):
        for r in json.load(open(ruta, encoding='utf-8')):
            fallos += comprobar(r, os.path.basename(ruta))
            rid = slug(r.get('nombre', ''))
            if rid in vistos:
                fallos.append(f"«{r['nombre']}» repetida (también en {vistos[rid]})")
                continue
            vistos[rid] = os.path.basename(ruta)
            recetas.append({'id': rid, **{k: r[k] for k in ('nombre', 'tipo', 'raciones', 'tiempo_min', 'dificultad', 'coste',
                                                            'etiquetas', 'ingredientes', 'pasos', 'truco') if k in r}})
    if fallos:
        print('\n'.join(fallos))
        sys.exit(1)
    recetas.sort(key=lambda r: r['id'])
    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump({'version': len(recetas), 'recetas': recetas}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(recetas)} recetas -> web/recetario.json ({os.path.getsize(SALIDA) // 1024} KB)')


if __name__ == '__main__':
    main()
