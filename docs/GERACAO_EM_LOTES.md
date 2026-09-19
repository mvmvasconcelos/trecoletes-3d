# Geração em Lotes com Modal Reutilizável

O Trecoletes 3D suporta geração em lote: a partir de uma lista de nomes, o sistema gera um arquivo `.3mf` individual para cada nome e entrega tudo compactado em um único ZIP — pronto para importar no Bambu Studio.

O fluxo tem duas peças: o componente `BatchGenerationModal` (UI) e o hook `useBatchGeneration` (lógica de post + polling).

**Páginas que atualmente exibem o modal de lote:**
- `ChaveiroSimples.tsx`, `LetreiraSocial.tsx`, `GeradorTopoBolo.tsx`, `TampaBic.tsx` — lógica de post + polling escrita na própria página.
- `PonteiraLapisTexto.tsx` — usa o hook `useBatchGeneration` (ver §2), que encapsula essa mesma lógica.

---

## 1. Componente `BatchGenerationModal`

Localização: `frontend/src/components/ui/BatchGenerationModal.tsx`

### 1.1 Como importar

```tsx
import { BatchGenerationModal, type BatchNameEntry } from '../components/ui/BatchGenerationModal';
```

### 1.2 Interface de Props

```ts
interface BatchGenerationModalProps {
    isOpen: boolean;                                        // Controla visibilidade do modal
    onClose: () => void;                                    // Chamado ao fechar (com confirmação se houver alterações)
    onGenerate: (rows: BatchNameEntry[]) => void | Promise<void>; // Chamado ao clicar em Gerar Modelos
    onDownload: () => void;                                 // Chamado ao clicar em Baixar Lote
    defaultExtrusorBase: number;                            // Valor padrão para novas linhas (base)
    defaultExtrusorLetras: number;                          // Valor padrão para novas linhas (letras)
    isGenerating: boolean;                                  // Desabilita o botão e muda o label
    progress: { done: number; total: number } | null;       // Exibe barra de progresso
    downloadUrl: string | null;                             // Exibe botão de download quando preenchido
    error?: string | null;                                  // Exibe mensagem de erro no corpo do modal
    title?: string;                                         // Título do modal (padrão: "Gerar em Lotes")
    downloadLabel?: string;                                 // Label do botão de download (padrão: "Baixar Lote (ZIP)")
}
```

### 1.3 Tipo `BatchNameEntry`

```ts
type BatchNameEntry = {
    nome: string;
    extrusor_base: number;
    extrusor_letras: number;
};
```

Este é o mesmo formato enviado ao endpoint `/api/generate_batch/{model_id}` via campo `names` (JSON array serializado).

---

## 2. Como Integrar em uma Nova Página

### 2.1 Hook `useBatchGeneration`

Localização: `frontend/src/hooks/useBatchGeneration.ts`. Encapsula estado
(`isBatchModalOpen`, `batchProgress`, `batchTmfUrl`), o polling em
`batch_status`, e a limpeza do `setInterval` no unmount — nada disso
precisa ser escrito na página.

```tsx
import { useBatchGeneration } from '../hooks/useBatchGeneration';

// params e setError vêm do useModelGenerate (ver docs/CRIANDO_NOVO_MODELO.md §2.1)
const { isBatchModalOpen, setIsBatchModalOpen, batchProgress, batchTmfUrl, handleBatchGenerate } =
    useBatchGeneration('meu_modelo', params, {
        skipKeys: ['text_line_1'], // campos do params que NÃO entram no POST (recalculados por nome)
        setError,
    });
```

`skipKeys` lista os campos de `params` que são recalculados por linha do
lote (sempre `text_line_1`; alguns modelos também excluem `text_line_2` ou
um campo de toggle secundário — ver `secondaryToggle` em §2.4).

### 2.2 Botão de abertura do modal (na sidebar)

```tsx
<div className="border-t border-neutral-800 pt-3 space-y-2">
    <button
        type="button"
        onClick={() => setIsBatchModalOpen(true)}
        disabled={!config}
        className="w-full py-2.5 text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 font-semibold rounded border border-neutral-700 transition-all"
    >
        Gerar em Lotes
    </button>
</div>
```

### 2.3 Instância do modal (ao final do JSX, antes de fechar `</Layout>`)

```tsx
<BatchGenerationModal
    isOpen={isBatchModalOpen}
    onClose={() => setIsBatchModalOpen(false)}
    onGenerate={handleBatchGenerate}
    onDownload={() => {
        if (batchTmfUrl) downloadBlob(batchTmfUrl, 'meu_modelo_lote.zip');
    }}
    defaultExtrusorBase={Number(params['extrusor_base']) || 1}
    defaultExtrusorLetras={Number(params['extrusor_letras']) || 2}
    isGenerating={batchProgress !== null && !batchTmfUrl}
    progress={batchProgress}
    downloadUrl={batchTmfUrl}
    error={error}
/>
```

---

## 3. Funcionalidades do Modal

### 3.1 Edição manual de linhas

Cada linha da lista tem três campos editáveis:

| Campo | Descrição |
|---|---|
| Nome | Texto que será usado como `text_line_1` no modelo |
| Letra | Número do extrusor/filamento para as letras |
| Base | Número do extrusor/filamento para a base |

- Botão **+** no rodapé esquerdo da lista adiciona uma nova linha vazia com os defaults do modelo.
- Botão **lixeira** remove a linha. Se for a última, ela é limpa (não removida).

### 3.2 Ciclo de capitalização (botão Aa)

Cada linha tem um botão **Aa** ao lado da lixeira que cicla a capitalização do nome:

```
Texto misto / Title Case  →  TUDO MAIÚSCULO  →  tudo minúsculo  →  Title Case  →  ...
```

A detecção é automática: o estado atual do input determina o próximo passo.

### 3.3 Importação de arquivo

O botão **Carregar arquivo** aceita `.json`, `.txt` e `.md`. O comportamento de parse depende da extensão:

**JSON** — suporta dois formatos:

```json
// Formato completo (preserva extrusores por pessoa)
[
  { "nome": "Prof Carine", "extrusor_base": 3, "extrusor_letras": 1 },
  { "nome": "Prof Guto",   "extrusor_base": 4, "extrusor_letras": 1 }
]

// Formato simplificado (usa defaults do modelo para extrusores)
["Prof Carine", "Prof Guto"]
```

**TXT ou MD** — um nome por linha, extrusores preenchidos com os defaults do modelo:

```
Prof Carine
Prof Guto
Prof Jade
```

Linhas vazias são ignoradas automaticamente em todos os formatos.

### 3.4 Aviso de duplicados

Nomes iguais são permitidos (geram arquivos distintos no ZIP com sufixo `_2`, `_3` etc.), mas o modal exibe um aviso em amarelo listando quais nomes aparecem mais de uma vez.

### 3.5 Fechamento com confirmação

O modal pode ser fechado pelo **X** no cabeçalho ou clicando fora da janela. Se o usuário tiver feito qualquer alteração desde a abertura, uma confirmação é pedida antes de fechar.

### 3.6 Download após geração

Ao concluir com sucesso, a barra de progresso exibe "Lote concluído!" e o botão **Baixar Lote (ZIP)** aparece no corpo do modal. O modal permanece aberto para que o usuário possa baixar quando quiser.

---

## 4. Comportamento do Backend

O endpoint `/api/generate_batch/{model_id}` recebe como `names` um JSON array de objetos com os campos `nome`, `extrusor_base` e `extrusor_letras`. Os extrusores por linha sobrescrevem o padrão do `params` apenas para aquele nome, permitindo que cada pessoa tenha cores diferentes no mesmo lote.

### 4.1 Deduplicação de arquivos no ZIP

Os nomes de arquivo dentro do ZIP são desambiguados de forma **case-insensitive** para evitar conflitos ao extrair no Windows (que não diferencia `KID.3mf` de `Kid.3mf`):

- A chave de contagem usa o nome em lowercase.
- O nome exibido no arquivo preserva a capitalização original.

Exemplo: `KID`, `KId`, `kid` → `KID.3mf`, `KId_2.3mf`, `kid_3.3mf`

### 4.2 Cache

O lote usa o mesmo mecanismo de cache hash-based dos modelos individuais. Se os mesmos nomes e parâmetros forem solicitados novamente, o ZIP é retornado instantaneamente do cache. Para forçar regeração, use o botão de limpar cache na sidebar antes de abrir o modal.
