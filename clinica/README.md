# Aether Odontologia — Landing page (tema claro)

Landing page de alto padrão para uma clínica odontológica e de estética, com foco em odontologia.

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
4. **Tratamentos** em bento grid com tilt 3D e borda luminosa
5. **Resultados**: scroll horizontal (desktop) / carrossel (mobile) com comparador antes/depois
6. **Agendamento + rodapé**

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
