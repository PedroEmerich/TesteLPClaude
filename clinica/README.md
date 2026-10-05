# Aether Clinic — Landing page (Cyber-Luxury / Bio-Tech)

Landing page de alto padrão para uma clínica odontológica e de estética avançada, em **um único arquivo HTML**.

## Como rodar
Abra `index.html` no navegador (precisa de internet para as CDNs) ou sirva a pasta:

```bash
npx serve .
```

## Stack (via CDN)
- Tailwind CSS (Play CDN) + CSS customizado com tokens em `:root`
- GSAP 3.12 + ScrollTrigger: entrada do título caractere a caractere, pins, scrub, scroll horizontal
- Lenis: smooth scroll integrado ao ScrollTrigger
- Three.js r128: objetos cromados flutuantes no hero e nuvem de pontos de um molar com linha de escaneamento (shader)

## Seções
1. **Hero**: título com split por caractere, palavra dinâmica, CTA magnético com borda luminosa, vídeo de fundo + 3D
2. **O futuro da odontologia**: spotlight que segue o cursor, modelo 3D escaneado conforme o scroll, cards que surgem pelo progresso
3. **Bento grid**: tilt 3D e borda em gradiente que acende conforme a proximidade do cursor
4. **Casos**: scroll horizontal pinado (desktop) / carrossel com snap (mobile), slider antes/depois (mouse, touch e teclado)
5. **Agendamento + rodapé**: formulário minimalista com labels flutuantes, status de agenda, redes com micro-interações

## Personalização
- **Vídeo de fundo**: coloque `assets/hero.mp4` (8–15s, ~3–5MB). Sem o arquivo, fica o fundo animado.
- **Casos/depoimentos**: array `CASES` no script. Os sorrisos são SVGs ilustrativos gerados por código; troque por fotos reais
  colocando `<img>` nas divs `.before` / `.after`.
- **Modelo 3D real**: substitua a geometria procedural em `createScan3D()` por um GLB (GLTFLoader) ou um embed do Spline.
- **Formulário**: o envio é simulado; integre no `TODO` de `form()` (fetch para CRM ou link de WhatsApp).

## Performance e acessibilidade
- Mobile (< 1024px): sem cursor customizado, sem pins, menos partículas/pontos, pixel ratio 1
- Renderização 3D pausa fora da tela (IntersectionObserver)
- `prefers-reduced-motion`: animações desligadas, conteúdo sempre visível
- Sem as CDNs de animação, a página continua legível (as animações só são ativadas se o GSAP carregar)
