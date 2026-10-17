# Context Health Bar - Expected Output

## Visual Reference

Quando o mod estiver ativo, você verá a barra no **canto inferior direito** do Claude Code:

```
┌─────────────────────────────────────────┬──────────────────────────────┐
│  Your prompt/response here              │  Status Line                 │
│                                          │  ███████░░░░░░░░░░░ 70k/180 │
│                                          │  (verde) 39%                 │
└─────────────────────────────────────────┴──────────────────────────────┘
```

---

## Scenarios de Teste

### 1️⃣ Session Start (0% - Vazio)
```
░░░░░░░░░░░░░░░░░░ 0/180k (0%)
```
**Cor**: Nenhuma (todos os barras vazias)

---

### 2️⃣ Green Zone (1-33% - Leve)
```
🟢██████░░░░░░░░░░░░ 30k/180k (17%)
```
**Cor**: Verde
**Faixa**: 0 até ~60k tokens

---

### 3️⃣ Yellow Zone (34-66% - Médio)
```
🟡████████████░░░░░░ 110k/180k (61%)
```
**Cor**: Amarelo
**Faixa**: 60k até 120k tokens

---

### 4️⃣ Red Zone (67-100% - Pesado)
```
🔴██████████████░░░░ 155k/180k (86%)
```
**Cor**: Vermelho
**Faixa**: 120k até 180k tokens

---

### 5️⃣ Full Context (100% - Limite)
```
🔴██████████████████ 180k/180k (100%)
```
**Cor**: Vermelho intenso
**Status**: Limite atingido

---

## Como Testar Passo a Passo

### Setup
```bash
# Reinicie o Claude Code ou use:
claude --plugin-dir /Users/gabrielkuhn/.claude/dev-mods/8e52836e-d7bf-4d34-b344-942a0aec915e/context-health-bar
```

### Test 1: Verificar Inicialização
**O que esperar:**
- Toast aparece: "Context Health Bar: claude-haiku-4-5 (180k max)"
- Status line mostra: `░░░░░░░░░░░░░░░░░░ 0/180k (0%)`

### Test 2: Enviar Mensagem
**Digite:** "Hello, how are you?"

**O que esperar:**
- Barra cresce conforme Claude gera resposta
- Cor muda de verde → amarelo → vermelho conforme tokens aumentam
- Status atualiza em tempo real: `█████░░░░░░░░░░░░░ 45k/180k (25%)`

### Test 3: Múltiplas Mensagens
**Digite:** Uma pergunta longa

**O que esperar:**
- Barra continua crescendo
- Pode passar de verde para amarelo: `███████████░░░░░░░░ 75k/180k (42%)`
- Texto em amarelo no terminal

### Test 4: Comando /context-config
**Digite:** `/context-config`

**O que esperar:**
- Toast mostra: `Config for claude-haiku-4-5: 180k max tokens`
- Barra continua visível

### Test 5: Reset
**Digite:** `/clear`

**O que esperar:**
- Nova sessão inicia
- Barra volta a `░░░░░░░░░░░░░░░░░░ 0/180k (0%)`
- Toast mostra configuração novamente

---

## Indicadores de Sucesso

✅ Barra aparece no canto inferior direito
✅ Começa vazia (0%)
✅ Cresce conforme tokens consumidos
✅ **Cores corretas**: Verde → Amarelo → Vermelho
✅ Percentual atualiza em tempo real
✅ `/context-config` funciona
✅ `/clear` reseta a barra

---

## Cores ANSI (Technical)

```
🟢 Verde:  \x1b[32m (0-60k)
🟡 Amarelo: \x1b[33m (60-120k)
🔴 Vermelho: \x1b[31m (120-180k)
Reset:    \x1b[0m
```

---

## Debug

Se algo não aparecer:

```bash
# Verificar se o mod está carregado
ls -la /Users/gabrielkuhn/.claude/dev-mods/8e52836e-d7bf-4d34-b344-942a0aec915e/context-health-bar/

# Validar código
cd /Users/gabrielkuhn/.claude/dev-mods/8e52836e-d7bf-4d34-b344-942a0aec915e/context-health-bar/
claude plugin validate .

# Rodar com debug
claude --debug --plugin-dir /Users/gabrielkuhn/.claude/dev-mods/8e52836e-d7bf-4d34-b344-942a0aec915e/context-health-bar/
```

---

## Nota Final

A barra é **não-intrusiva**: aparece apenas no status line, não interfere com o prompt ou respostas. Ideal para monitorar contexto sem distrações!
