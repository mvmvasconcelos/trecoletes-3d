import json
import requests
import sys

# Dados da requisição
data = {
    'text_line_1': 'Vinicius Teste',
    'text_line_2': '',
    'text_size_1': 12,
    'text_size_2': 8,
    'fill_word_gaps': 'true',
    'outline_margin': 1.5,
    'spacing': 1.0,
    'word_spacing': 1.0,
    'letter_height': 15,
    'base_height': 5,
    'hole_x': 0,
    'hole_y': -8,
    'hole_z': 2.5,
    'hole_diameter': 3,
    'hole_length': 50,
    'hole_orientation': 'TOPBOTTOM',
    'hole_type': 'ROUND',
    'color_base': '#333333',
    'color_letters': '#E0E0E0'
}

url = 'http://localhost:8000/api/generate'
print(f'Enviando POST para {url}...')
print('Dados:', json.dumps(data, indent=2))

try:
    response = requests.post(url, json=data, timeout=30)
    print(f'\nStatus Code: {response.status_code}')
    print('Response:')
    print(response.text)
except Exception as e:
    print(f'Erro: {e}', file=sys.stderr)
    sys.exit(1)
