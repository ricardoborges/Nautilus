# Implementação de Conexão Nativa WSL2 e Gestão Docker no Nautilus

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que usuários no Windows criem uma conexão nativa para o WSL2 no Nautilus, gerenciando containers na aba Docker e visualizando métricas da VM local sem necessidade de configuração de servidor SSH.

**Architecture:** Introduzir a abstração `CommandRunner` com implementações `SSHCommandRunner` e `WSLCommandRunner` (invocando `wsl.exe` com tratamento UTF-16LE/UTF-8), desacoplando os handlers de Docker e Métricas do `SSHClient`. No frontend, adicionar o tipo de conexão `'wsl'`, seleção dinâmica de distros instaladas e adaptação do ciclo de vida da conexão.

**Tech Stack:** TypeScript, Node.js (v22), Tauri v2, React 19, Ant Design v5, `wsl.exe`, `child_process`.

**Spec:** [`docs/superpowers/specs/2026-09-28-wsl2-docker-connection-design.md`](file:///d:/dev/github/ricardoborges/Nautilus/docs/superpowers/specs/2026-09-28-wsl2-docker-connection-design.md)

## Global Constraints

- Sistema operacional Windows 11 com terminal PowerShell.
- Tratamento obrigatório de saída de buffer do `wsl.exe` para suporte a UTF-16LE e UTF-8.
- Tipos de conexão suportados: `'ssh' | 'rdp' | 'wsl'`.
- Nenhuma dependência nativa C++ que quebre o empacotamento com `pkg`.

---

### Task 1: Definição de Tipos e Modelo de Dados

**Files:**
- Modify: `backend/src/shared/types/index.ts:20-55`
- Modify: `backend/src/features/connections/connection.model.ts:1-40`
- Modify: `src/types.ts:9-42`
- Test: `backend/src/features/connections/connection.model.test.ts`

**Interfaces:**
- Consumes: N/A
- Produces: `Connection.connectionType` suportando `'wsl'`, `wslDistro?: string`, `wslUser?: string`.

- [ ] **Step 1: Escrever teste unitário para ConnectionModel com suporte a WSL**

```typescript
// backend/src/features/connections/connection.model.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionModel } from './connection.model';

test('ConnectionModel - deve instanciar conexão WSL2 com defaults apropriados', () => {
    const model = new ConnectionModel({
        name: 'Local Ubuntu',
        host: 'localhost',
        user: 'default',
        connectionType: 'wsl',
        wslDistro: 'Ubuntu',
        wslUser: 'ricardo',
        authMethod: 'password',
    });

    assert.equal(model.connectionType, 'wsl');
    assert.equal(model.wslDistro, 'Ubuntu');
    assert.equal(model.wslUser, 'ricardo');
    assert.ok(model.id);
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npx tsx --test backend/src/features/connections/connection.model.test.ts`
Expected: FAIL (campos `wslDistro` e `wslUser` não existem em `ConnectionData` / `ConnectionModel`).

- [ ] **Step 3: Implementar campos no backend e frontend**

Atualizar `backend/src/shared/types/index.ts`, `backend/src/features/connections/connection.model.ts` e `src/types.ts`:
- Expandir `connectionType: 'ssh' | 'rdp' | 'wsl'`.
- Adicionar `wslDistro?: string` e `wslUser?: string`.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx --test backend/src/features/connections/connection.model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add backend/src/shared/types/index.ts backend/src/features/connections/connection.model.ts src/types.ts backend/src/features/connections/connection.model.test.ts
git commit -m "feat(types): add wsl connection type and properties"
```

---

### Task 2: Camada de Execução (`CommandRunner`, `WSLCommandRunner`, `SSHCommandRunner`, Factory)

**Files:**
- Create: `backend/src/features/execution/command-runner.interface.ts`
- Create: `backend/src/features/execution/wsl-command-runner.ts`
- Create: `backend/src/features/execution/ssh-command-runner.ts`
- Create: `backend/src/features/execution/runner.factory.ts`
- Create: `backend/src/features/execution/index.ts`
- Test: `backend/src/features/execution/wsl-command-runner.test.ts`

**Interfaces:**
- Consumes: `Connection`, `SSHConfig`, `SSHClient`
- Produces: `CommandRunner.exec(command: string, options?: { timeout?: number }) => Promise<CommandResult>`, `getCommandRunner(connection: Connection) => Promise<CommandRunner>`.

- [ ] **Step 1: Escrever teste unitário para decodificação e montagem de comando no WSLCommandRunner**

```typescript
// backend/src/features/execution/wsl-command-runner.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWslBuffer, buildWslArgs } from './wsl-command-runner';

test('buildWslArgs - monta argumentos com distro e sh -c', () => {
    const args = buildWslArgs('Ubuntu', 'docker ps', 'ricardo');
    assert.deepEqual(args, ['-d', 'Ubuntu', '-u', 'ricardo', '--', 'sh', '-c', 'docker ps']);
});

test('decodeWslBuffer - decodifica saída UTF-16LE com null bytes', () => {
    const buf = Buffer.from('Ubuntu\0\r\0\n\0docker-desktop\0\r\0\n\0', 'utf16le');
    const result = decodeWslBuffer(buf);
    assert.equal(result.includes('Ubuntu'), true);
    assert.equal(result.includes('docker-desktop'), true);
    assert.equal(result.includes('\0'), false);
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npx tsx --test backend/src/features/execution/wsl-command-runner.test.ts`
Expected: FAIL (módulos não encontrados).

- [ ] **Step 3: Implementar `command-runner.interface.ts`, `wsl-command-runner.ts`, `ssh-command-runner.ts` e `runner.factory.ts`**

Criar as implementações com execução via `child_process.execFile('wsl.exe', ...)` e fallback UTF-8/UTF-16LE.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx --test backend/src/features/execution/wsl-command-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add backend/src/features/execution/
git commit -m "feat(backend): implement CommandRunner abstraction and WSLCommandRunner"
```

---

### Task 3: Endpoints IPC para WSL (`isAvailable` e `listDistros`)

**Files:**
- Create: `backend/src/features/execution/wsl-detector.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/features/execution/wsl-detector.test.ts`

**Interfaces:**
- Consumes: `child_process.execFile`
- Produces: `ssm:wsl:isAvailable`, `ssm:wsl:listDistros`.

- [ ] **Step 1: Escrever teste para detecção e parsing de distros**

```typescript
// backend/src/features/execution/wsl-detector.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDistroList } from './wsl-detector';

test('parseDistroList - filtra nomes vazios e remove caracteres especiais', () => {
    const raw = 'Ubuntu\r\n\0docker-desktop\r\narchlinux\r\n';
    const list = parseDistroList(raw);
    assert.deepEqual(list, ['Ubuntu', 'docker-desktop', 'archlinux']);
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npx tsx --test backend/src/features/execution/wsl-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `wsl-detector.ts` e registrar handlers no `backend/src/index.ts`**

Adicionar handlers `ssm:wsl:isAvailable` e `ssm:wsl:listDistros`.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npx tsx --test backend/src/features/execution/wsl-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add backend/src/features/execution/wsl-detector.ts backend/src/features/execution/wsl-detector.test.ts backend/src/index.ts
git commit -m "feat(backend): add ssm:wsl:isAvailable and ssm:wsl:listDistros handlers"
```

---

### Task 4: Atualizar Handlers Docker no Backend para usar `CommandRunner`

**Files:**
- Modify: `backend/src/index.ts:805-1350`
- Test: `backend/src/index.ts` typecheck

**Interfaces:**
- Consumes: `getCommandRunner(conn)`
- Produces: Handlers `ssm:docker:*` operando tanto com SSH quanto com WSL.

- [ ] **Step 1: Identificar e migrar chamadas `new SSHClient` nos handlers Docker para `getCommandRunner`**

Substituir o padrão:
```typescript
const authConfig = await getAuthConfig(conn as AuthArgs);
const ssh = new SSHClient(authConfig);
try {
    await ssh.connect();
    const result = await ssh.exec(cmd);
} finally {
    ssh.end();
}
```
Por:
```typescript
const runner = await getCommandRunner(conn);
const result = await runner.exec(cmd);
```
Em:
- `ssm:docker:check`
- `ssm:docker:list`
- `ssm:docker:action`
- `ssm:docker:stats`
- `ssm:docker:images`
- `ssm:docker:imageAction`
- `ssm:docker:volumes`
- `ssm:docker:volumeAction`
- `ssm:docker:networks`
- `ssm:docker:networkAction`
- `ssm:docker:stacks`
- `ssm:docker:logs`
- `ssm:docker:composeUp`
- `ssm:docker:composeDown`

- [ ] **Step 2: Executar typecheck do backend para validar compatibilidade**

Run: `npm run typecheck --prefix backend`
Expected: 0 errors

- [ ] **Step 3: Commit**

```powershell
git add backend/src/index.ts
git commit -m "refactor(backend): migrate docker handlers to CommandRunner"
```

---

### Task 5: Adaptar Métricas do Sistema (`SystemMonitor`) para `CommandRunner`

**Files:**
- Modify: `backend/src/features/metrics/metrics.service.ts`
- Modify: `backend/src/index.ts` (chamada de inicialização do monitor)
- Test: `backend/src/features/metrics/metrics.service.ts` typecheck

**Interfaces:**
- Consumes: `CommandRunner`
- Produces: `SystemMonitor` coletando métricas no WSL e SSH.

- [ ] **Step 1: Modificar `SystemMonitor` para utilizar `CommandRunner`**

Permitir que `SystemMonitor` execute `runner.exec(compoundCmd)` em vez de `sshClient.exec(command)`.

- [ ] **Step 2: Executar typecheck do backend**

Run: `npm run typecheck --prefix backend`
Expected: 0 errors

- [ ] **Step 3: Commit**

```powershell
git add backend/src/features/metrics/metrics.service.ts backend/src/index.ts
git commit -m "refactor(metrics): adapt SystemMonitor to use CommandRunner"
```

---

### Task 6: Frontend Bridge & Tipos IPC

**Files:**
- Modify: `src/tauri-bridge.ts`
- Test: `npm run build` typecheck do frontend

**Interfaces:**
- Consumes: `window.ssm`
- Produces: `window.ssm.wslIsAvailable()`, `window.ssm.wslListDistros()`.

- [ ] **Step 1: Adicionar métodos `wslIsAvailable` e `wslListDistros` na interface `SSMApi`**

```typescript
wslIsAvailable: () => Promise<{ available: boolean }>;
wslListDistros: () => Promise<{ distros: string[]; defaultDistro?: string }>;
```

- [ ] **Step 2: Executar build/typecheck do frontend**

Run: `npm run build`
Expected: Sucesso ou erros restritos a chamadas pendentes.

- [ ] **Step 3: Commit**

```powershell
git add src/tauri-bridge.ts
git commit -m "feat(bridge): declare WSL IPC methods in tauri-bridge"
```

---

### Task 7: Interface do Formulário de Conexão (`ConnectionModal.tsx`)

**Files:**
- Modify: `src/components/modals/ConnectionModal.tsx`
- Modify: `src/i18n/locales/pt-BR.json` e `en.json`

**Interfaces:**
- Consumes: `window.ssm.wslIsAvailable()`, `window.ssm.wslListDistros()`
- Produces: Opção WSL2 no modal de conexão com dropdown de distros.

- [ ] **Step 1: Adicionar checagem de suporte WSL2 e carregamento de distros**

Carregar `isWslAvailable` via `useEffect` no modal.

- [ ] **Step 2: Renderizar opção 'WSL2' e campos específicos**

Quando `connectionType === 'wsl'`:
- Exibir dropdown com as distros retornadas por `wslListDistros()`.
- Ocultar Host, Porta, Senha, Chave SSH e Bastion Host.
- Adicionar validações de formulário específicas para WSL (`wslDistro` obrigatório).

- [ ] **Step 3: Executar build do frontend**

Run: `npm run build`
Expected: Sucesso

- [ ] **Step 4: Commit**

```powershell
git add src/components/modals/ConnectionModal.tsx src/i18n/locales/
git commit -m "feat(ui): add WSL2 connection type and distro selector in ConnectionModal"
```

---

### Task 8: Identidade Visual e Contexto de Conexão

**Files:**
- Modify: `src/components/connections/ConnectionManager.tsx`
- Modify: `src/components/connections/ConnectionTabs.tsx`
- Modify: `src/context/ConnectionContext.tsx`

**Interfaces:**
- Consumes: `connection.connectionType === 'wsl'`
- Produces: Ícone representativo do WSL/Linux e bypass de chave de host SSH.

- [ ] **Step 1: Renderizar ícone Linux/WSL nas abas e na lista lateral**

Utilizar ícone visual distintivo quando `connectionType === 'wsl'`.

- [ ] **Step 2: Atualizar `ConnectionContext.tsx`**

Ignorar verificação de chave de host SSH se `connectionType === 'wsl'`, conectando imediatamente com início de métricas e check de Docker.

- [ ] **Step 3: Executar build completo da aplicação**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/components/connections/ConnectionManager.tsx src/components/connections/ConnectionTabs.tsx src/context/ConnectionContext.tsx
git commit -m "feat(ui): add WSL visual identity and bypass SSH host key check in ConnectionContext"
```

---

### Task 9: Validação End-to-End

**Files:**
- Test: Execução dos testes automatizados e validação interativa com backend em execução

- [ ] **Step 1: Executar todos os testes automatizados do backend**

Run: `npm run typecheck --prefix backend`
Expected: 0 erros

- [ ] **Step 2: Executar build de produção do frontend**

Run: `npm run build`
Expected: Build concluído com sucesso

- [ ] **Step 3: Teste manual guiado / verificação de conexão**

Iniciar o backend com `npx tsx watch src/index.ts` e validar a criação e conexão com a distro `Ubuntu` do WSL local, checando a visualização dos 15 containers e métricas de saúde da VM.

- [ ] **Step 4: Commit final da branch/feature**

```powershell
git commit --allow-empty -m "chore: complete WSL2 Docker connection integration"
```
