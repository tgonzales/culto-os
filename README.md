# cultoOS

Software de projeção para cultos: letras, Bíblia, mídia, avisos, controle pelo celular e tela de retorno (stage).

cultoOS é um fork do [FreeShow](https://github.com/ChurchApps/FreeShow), criado pela ChurchApps e colaboradores e distribuído sob a licença **GPL-3.0**. Este repositório continua sob a mesma licença (veja [LICENSE](LICENSE)). O README original do projeto está em [README.upstream.md](README.upstream.md).

## Desenvolvimento

Requisitos: Node.js >= 22.12.

```bash
npm ci
npm start          # modo desenvolvimento
npm run build      # build de produção
npx electron-builder --config config/building/electron-builder.yaml --win nsis --publish never   # instalador Windows
```

O instalador Windows também é gerado pelo workflow `.github/workflows/build.yml`.

> Observação: `npm run build` reescreve `public/index.html` para apontar para o bundle. Não faça commit dessa alteração (`git checkout public/index.html`).

## Marca

Nome, pastas de dados, links e repositório de atualizações ficam centralizados em `src/types/Brand.ts`.

## Upstream

```bash
git remote add upstream https://github.com/ChurchApps/FreeShow.git
git fetch upstream
git cherry-pick <commit>   # trazer correções pontuais
```
