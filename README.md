# Casa Cascata — landing page com tour imersivo

Abra `index.html` (ou sirva a pasta com `npx serve .`).

## Vídeo do tour (kie.ai)

O tour mostra **um único vídeo** que acompanha o scroll: fachada → porta → living → jantar → cascata → área externa.
O vídeo é gerado pelo kie.ai (Kling v2.1 Pro) a partir das 5 fotos de `assets/`:

```bash
node scripts/gerar-video.mjs --dry-run   # mostra o plano, sem gastar créditos
node scripts/gerar-video.mjs             # gera de verdade (precisa de KIE_AI_API_KEY)
```

A chave vem da variável de ambiente `KIE_AI_API_KEY` ou de um arquivo `.env` (já está no `.gitignore`).
O script cria 4 clipes de 5s, cada um começando numa foto e terminando na seguinte, junta tudo em
`assets/video/tour.mp4` e extrai os quadros em `assets/frames/`. Depois é só fazer commit dessas duas pastas.

Enquanto o vídeo não for gerado, a página usa uma animação de câmera sobre as fotos (array `SHOTS` em `tour.js`).

- Textos dos capítulos: `index.html` (`data-from` / `data-to` controlam quando cada um aparece).
- Prompts de cada trecho do vídeo: array `TRANSITIONS` em `scripts/gerar-video.mjs`.
