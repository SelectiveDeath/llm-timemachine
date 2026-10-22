"""배포 전에 실행: JS·CSS 주소에 버전(?v=...)을 붙여서, 사이트를 고친 뒤 새로고침(F5) 한 번이면 새 파일을 받게 한다.

GitHub Pages는 파일을 10분 동안 캐시하라고 알려 주기 때문에, 버전이 없으면 브라우저가 예전 JS를 계속 쓸 수 있다.
- index.html, admin.html의 <link>/<script src>에 ?v=버전
- 모듈끼리 import 하는 파일은 import map(<script type="importmap" id="versions">)으로 ?v=버전 주소에 연결
- 버전은 js/, css/ 파일 내용 전체의 해시라서, 아무 파일도 안 바뀌면 그대로

사용: python tools/cachebust.py
"""
import hashlib, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ['index.html', 'admin.html']

# 먼저 모든 JS의 문법을 검사한다 (깨진 파일이 배포되지 않도록)
broken = []
for js in sorted((ROOT / 'js').rglob('*.js')) + sorted((ROOT / 'worker').glob('*.js')):
    r = subprocess.run(['node', '--check', str(js)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        broken.append(f'{js.relative_to(ROOT)}\n{r.stderr.strip()}')
if broken:
    print('문법 오류가 있어서 중단합니다:\n\n' + '\n\n'.join(broken))
    sys.exit(1)

files = sorted(p for d in ('js', 'css') for p in (ROOT / d).rglob('*') if p.suffix in ('.js', '.css'))
digest = hashlib.sha256()
for p in files:
    digest.update(p.relative_to(ROOT).as_posix().encode())
    digest.update(p.read_bytes())
version = digest.hexdigest()[:8]

imports = {f'./{p.relative_to(ROOT).as_posix()}': f'./{p.relative_to(ROOT).as_posix()}?v={version}' for p in files if p.suffix == '.js'}
importmap = '<script type="importmap" id="versions">\n' + json.dumps({'imports': imports}, indent=2) + '\n</script>'

for name in PAGES:
    path = ROOT / name
    html = path.read_text(encoding='utf-8')
    # 기존 버전 꼬리표와 import map 지우기
    html = re.sub(r'\n?<script type="importmap" id="versions">.*?</script>', '', html, flags=re.S)
    html = re.sub(r'((?:href|src)="(?:js|css)/[^"?]+)\?v=[0-9a-f]+"', r'\1"', html)
    # 새 버전 붙이기
    html = re.sub(r'((?:href|src)="(?:js|css)/[^"]+)"', rf'\1?v={version}"', html)
    html = html.replace('</head>', importmap + '\n</head>', 1)
    path.write_text(html, encoding='utf-8')

print('version', version, '·', len(imports), 'modules')
