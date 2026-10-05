# Odontoral Prime — Landing page

Landing page da Clínica Odontoral Prime (Mogi das Cruzes - SP). Identidade: azul-marinho #12355B + dourado #C9A45C, logo com dente e coroa ("Prime").

## Como rodar
Abra `index.html` no navegador (precisa de internet para as CDNs) ou sirva a pasta:

```bash
npx serve .
```

## Estrutura
```
index.html              página (HTML + Tailwind + CSS + JS das interações)
js/teeth.js             modelos 3D procedurais (molar, incisivos, arcada, implante) em Three.js
assets/img/             fotos dos casos (paciente-*) e renderizações 3D (sorriso, implante, molar)
tools/render-assets.*   gera de novo as imagens de assets/img
```

## Seções
1. **Hero**: título com entrada caractere a caractere, palavra dinâmica, CTA magnético, dentes 3D flutuando
2. **Diagnóstico** (texto à esquerda, dente com cárie, fratura, manchas e tártaro à direita, com rótulos)
3. **Tratamento** (ao rolar, o dente gira, fica saudável e passa para a esquerda; texto à direita).
   As duas seções compartilham um palco 3D fixo (`position: sticky`); a linha do tempo está em `createJourney()`.
4. **Tratamentos** em bento grid com tilt 3D e borda luminosa. O card de **Lentes de Contato** tem um simulador de tom:
   passar o mouse (ou tocar) na escala de cor 3D (BL1 → A1) recolore os dentes da foto. Os tons ficam no array `SHADES`
   (`tab` = cor da escala, `tint` = cor multiplicada sobre os dentes). A camada dos dentes é `assets/img/sorriso-lentes-dentes.png`
   (mesmo tamanho da foto, com transparência fora dos dentes); para trocar a foto, gere uma nova máscara.
5. **Resultados**: scroll horizontal (desktop) / carrossel (mobile) com comparador antes/depois
6. **Agendamento + mapa + rodapé**. O mapa é um embed do Google Maps (sem chave de API); para mudar o endereço,
   troque o texto do parâmetro `q=` no `src` do iframe e nos links "Como chegar" / "Abrir no Waze".

## Imagens
Os casos antes/depois usam fotos reais (`paciente-1-*`, `paciente-2-*`). Para incluir mais casos, coloque o par de fotos
com o mesmo tamanho e enquadramento em `assets/img/` e adicione um item no array `CASES` do script.
As demais imagens são renderizações 3D ilustrativas. Para trocar por fotos reais da clínica, substitua os arquivos em
`assets/img/` (mesmos nomes) ou edite os `src` no HTML e o array `CASES` no script.
Para gerar as renderizações de novo:

```bash
npm i -D playwright
node tools/render-assets.cjs
```

Vídeo de fundo opcional no hero: `assets/hero.mp4`.

## Performance e acessibilidade
- Mobile (< 1024px): sem cursor customizado, sem pin no scroll horizontal, modelos com menos polígonos
- Cenas 3D pausam fora da tela; sem WebGL, a jornada do dente usa as imagens `molar-antes.png` / `molar.png`
- `prefers-reduced-motion` respeitado; sem as CDNs de animação o conteúdo continua visível
