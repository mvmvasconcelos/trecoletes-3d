import os
import re
import urllib.request

# Obtém caminhos do projeto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS_DIR = os.path.join(BASE_DIR, "static", "fonts")

def ensure_font_downloaded(font_family: str) -> str:
    """
    Verifica se a fonte solicitada (por nome da família) já existe localmente.
    Caso não exista, faz o download do TTF diretamente do Google Fonts e o armazena em static/fonts.
    Retorna o caminho absoluto para o arquivo TTF (.ttf) garantido ou None se falhar.
    """
    if not font_family:
        return None
        
    os.makedirs(FONTS_DIR, exist_ok=True)
    
    # Normaliza o nome do arquivo para algo seguro
    safe_family_name = "".join(c if c.isalnum() else "_" for c in font_family).strip("_")
    ttf_path = os.path.join(FONTS_DIR, f"{safe_family_name}.ttf")
    
    if os.path.exists(ttf_path):
        return ttf_path
        
    print(f"[FONTS] Fazendo o download da fonte '{font_family}' do Google Fonts...", flush=True)
    
    # URL do Google Fonts API
    url = f"https://fonts.googleapis.com/css?family={font_family.replace(' ', '+')}"
    
    # Android 2.2 User-Agent força a retormar links diretos do arquivo .ttf 
    # (Em vez de WOFF2 moderno que não é lido pelo OpenSCAD)
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"
    }
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            css = response.read().decode('utf-8')
            
            # Encontrar o link URL da fonte .ttf
            urls = re.findall(r"url\((.*?\.ttf.*?)\)", css)
            if not urls:
                print(f"[FONTS ERROR] Nenhum link TTF encontrado no CSS para '{font_family}'", flush=True)
                return None
                
            ttf_url = urls[0].strip("'\"")
            
            # Fazer download físico do TTF e salvar em FONTS_DIR
            urllib.request.urlretrieve(ttf_url, ttf_path)
            print(f"[FONTS] Fonte '{font_family}' salva em {ttf_path}", flush=True)
            
            return ttf_path
    except Exception as e:
        print(f"[FONTS ERROR] Falha ao efetuar download da fonte {font_family}: {repr(e)}", flush=True)
        return None
