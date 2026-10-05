# Casa Cascata — landing page com tour imersivo

Abra `index.html` (ou sirva a pasta com `npx serve .`).

- O tour é um "vídeo" renderizado em `<canvas>` que acompanha o scroll: fachada → porta → living → jantar → janela → cascata → área externa.
- Os movimentos de câmera ficam no array `SHOTS` em `tour.js` (zoom, ponto focal, opacidade e desfoque por ponto de progresso).
- Textos dos capítulos estão em `index.html` (`data-from` / `data-to` controlam quando cada um aparece).
- Imagens em `assets/`.
