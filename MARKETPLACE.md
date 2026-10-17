# Context Health Bar - Marketplace Installation

## Para Usuários

### Instalação via Marketplace

```bash
/plugin install context-health-bar --marketplace BitNik01000111/context-health-bar
```

Então responda:
- `y` para adicionar o marketplace
- Escolha o escopo (recomendado: seu usuário)

### Ou Instalação Direta do GitHub

```bash
/plugin install BitNik01000111/context-health-bar
```

## Para Desenvolvedores

### Teste Localmente

```bash
# Desenvolvimento com hot-reload
claude --plugin-dir ~/Projects/context-health-bar

# Ou via CLAUDE_CODE_PLUGIN_DIRS
export CLAUDE_CODE_PLUGIN_DIRS=~/Projects/context-health-bar
claude
```

### Validação

```bash
cd ~/Projects/context-health-bar
claude plugin validate .
```

### Publicação no Marketplace

O arquivo `.claude-plugin/marketplace.json` já está configurado. Para usá-lo:

1. Certifique-se de que o repo está público: `gh repo view --json isPrivate`
2. A instalação via marketplace funciona quando alguém roda:
   ```bash
   /plugin install context-health-bar --marketplace BitNik01000111/context-health-bar
   ```

## Estrutura do Marketplace

```json
{
  "name": "Context Health Bar Marketplace",
  "owner": { "name": "Gabriel Kuhn" },
  "plugins": [
    {
      "name": "context-health-bar",
      "source": "./"
    }
  ]
}
```

## Atualizações Futuras

1. Faça mudanças no código
2. Commit e push:
   ```bash
   git add -A
   git commit -m "Feature description"
   git push origin main
   ```
3. Usuários com o mod instalado verão a atualização quando executarem `/reload-plugins`

## Suporte

Abra issues em: https://github.com/BitNik01000111/context-health-bar/issues
