"""
Teste de unidade para `_render_part` (backend/app/api/generator.py).

Diferente dos outros testes deste diretório, não bate num servidor real:
mocka `subprocess.run` e chama a função isolada. Cobre os 5 caminhos que
os 3 handlers (generate, generate_parametric, generate_batch) dependiam
antes da extração:
  1. Cache-hit: STL já existe -> não chama subprocess.run
  2. Sucesso: subprocess.run ok -> devolve output_path
  3. Timeout -> devolve TimeoutError com a mensagem padrão
  4. CalledProcessError -> devolve RuntimeError preservando e.stderr
     (esta é a asserção que trava a regressão que o lote tinha: antes da
     extração, o lote descartava o stderr e só devolvia uma mensagem
     genérica de subprocess)
  5. Exceção genérica -> devolve RuntimeError com repr() do erro
"""

import subprocess
import sys
from unittest.mock import patch

sys.path.insert(0, "/app")
from app.api.generator import _render_part  # noqa: E402


def main() -> int:
    part, scad_args, scad_path, font_path = "letters", ["-D", "x=1"], "/models/x/model.scad", "/fonts:/models/x"

    # 1. Cache-hit
    with patch("os.path.exists", return_value=True), \
         patch("subprocess.run") as mock_run:
        result = _render_part(part, scad_args, scad_path, "/tmp/out.stl", font_path)
        assert result == "/tmp/out.stl", f"esperava cache-hit devolver o path, veio {result!r}"
        mock_run.assert_not_called()
    print("[OK] cache-hit não chama subprocess.run")

    # 2. Sucesso
    with patch("os.path.exists", return_value=False), \
         patch("subprocess.run", return_value=None):
        result = _render_part(part, scad_args, scad_path, "/tmp/out.stl", font_path)
        assert result == "/tmp/out.stl", f"esperava sucesso devolver o path, veio {result!r}"
    print("[OK] sucesso devolve output_path")

    # 3. Timeout
    with patch("os.path.exists", return_value=False), \
         patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="openscad-nightly", timeout=300)):
        result = _render_part(part, scad_args, scad_path, "/tmp/out.stl", font_path)
        assert isinstance(result, TimeoutError), f"esperava TimeoutError, veio {type(result)}"
        assert "300s" in str(result), f"mensagem sem o timeout: {result}"
    print("[OK] timeout devolve TimeoutError com a duração")

    # 4. CalledProcessError — a asserção que trava a regressão do lote
    stderr_real = "ERROR: cyl() is not a known module (BOSL2 não incluído)"
    err = subprocess.CalledProcessError(returncode=1, cmd="openscad-nightly", stderr=stderr_real)
    with patch("os.path.exists", return_value=False), \
         patch("subprocess.run", side_effect=err):
        result = _render_part(part, scad_args, scad_path, "/tmp/out.stl", font_path)
        assert isinstance(result, RuntimeError), f"esperava RuntimeError, veio {type(result)}"
        assert str(result) == stderr_real, (
            f"stderr do OpenSCAD foi perdido: esperava {stderr_real!r}, veio {str(result)!r}"
        )
    print("[OK] CalledProcessError preserva o stderr real do OpenSCAD (regressão do lote corrigida)")

    # 5. Exceção genérica
    with patch("os.path.exists", return_value=False), \
         patch("subprocess.run", side_effect=OSError("disco cheio")):
        result = _render_part(part, scad_args, scad_path, "/tmp/out.stl", font_path)
        assert isinstance(result, RuntimeError), f"esperava RuntimeError, veio {type(result)}"
        assert "disco cheio" in str(result), f"repr() do erro original sumiu: {result}"
    print("[OK] exceção genérica devolve RuntimeError com repr() do erro original")

    print("\nTODOS OS TESTES PASSARAM.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
