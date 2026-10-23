"""Limpieza de objetos ocultos del SVG antes de importarlo en Aspire. Requiere lupa (Lua 5.1)."""
from pathlib import Path
import re
import unittest
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[2]


def load(machine: str):
    text = (ROOT / 'aspire-gadgets' / f'ArmarPrograma_{machine}.lua').read_text(encoding='utf-8')
    start = text.index('local function stripHiddenSvg(text)')
    end = text.index('local function stripHiddenSvgFile(path)')
    lua = LuaRuntime(unpack_returned_tuples=True)
    return lua.execute(text[start:end] + '\nreturn stripHiddenSvg')


# Exportado de Illustrator como el vector de Superflag: un círculo oculto por clase.
ILLUSTRATOR = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 226.77 113.39">
  <defs><style>
      .st0 {
        display: none;
        fill: #a57e4b;
      }

      .st1 { fill: #523e26; }
  </style></defs>
  <g id="Capa_1">
    <path class="st0" d="M203.41,7.02c-.8,4.19-2.32,7.59-4.51,10.11Z"/>
  </g>
  <g id="Capa_2"><g>
    <path class="st1" d="M11.07,96.98l-2.26-.54Z"/>
    <rect class="st1" x="55.7" y="91.33" width="2.54" height="13.12"/>
  </g></g>
</svg>'''


class StripHiddenSvg(unittest.TestCase):
    def test_all_machines_share_the_same_cleanup(self):
        for machine in ('Chica', 'Grande', 'XL'):
            clean, removed = load(machine)(ILLUSTRATOR)
            self.assertEqual(removed, 1, machine)
            self.assertNotIn('M203.41', clean)
            self.assertIn('M11.07', clean)
            self.assertIn('<rect class="st1"', clean)

    def test_inline_attributes_and_hidden_groups(self):
        strip = load('Chica')
        svg = ('<svg><path d="A"/><g style="display: none"><path d="B"/><g><path d="C"/></g></g>'
               '<path display="none" d="D"/><circle visibility="hidden" r="1"/><path d="E"/></svg>')
        clean, removed = strip(svg)
        self.assertEqual(removed, 3)
        self.assertEqual(re.findall(r'd="(\w)"', clean), ['A', 'E'])
        self.assertNotIn('<circle', clean)

    def test_visible_svg_stays_identical(self):
        strip = load('XL')
        svg = '<svg><style>.a{fill:red}</style><path class="a" d="M0 0Z"/></svg>'
        clean, removed = strip(svg)
        self.assertEqual(removed, 0)
        self.assertEqual(clean, svg)


if __name__ == '__main__':
    unittest.main()
