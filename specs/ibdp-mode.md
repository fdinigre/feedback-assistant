# Modo IBDP — provas com markscheme oficial + IA (Mathematical Exploration)

Spec escrita em 13/07/2026 a partir de entrevista com a Fernanda. Estende o
myp-feedback-assistant (ver `specs/myp-feedback-assistant.md`) com um segundo
programa: **IBDP Mathematics: Applications and Interpretation (SL)**.

## Objetivo

Levar o mesmo alívio de rotina do MYP para as turmas de DP da Fernanda:
corrigir quizzes formativos e unit tests somativos **mark a mark contra o
markscheme oficial do IB**, converter o percentual em grade 1–7 via grade
boundaries, e gerar o report com correlação de dados + comentário Toddle na
mesma estrutura já validada. Além disso, apoiar o ciclo do **IA (Mathematical
Exploration)** que começa em agosto/2026: feedback no draft, correção da
versão final com evidência por critério, e acompanhamento de marcos dos ~30
alunos.

Turma atual: **AI SL Year 2, ~30 alunos** (não há Year 1 este ano). Year 1
deve ficar pronto desde já — a ferramenta será usada nos próximos anos.

## Escopo

**Dentro:**
- Turmas DP (AI SL Year 1 e Year 2) convivendo com as turmas MYP no mesmo app,
  mesmo roster de alunos, mesma navegação.
- Avaliações DP: quiz (formativo) e unit test (somativo) — **ambos com o fluxo
  completo** (correção + report + comentário), sem versão "light".
- Correção às cegas contra markscheme oficial do IB, seguindo a notação à
  risca (M/A/R, marks implícitos, ft, AG).
- Grade boundaries por prova (% → grade 1–7), tabela editável no setup.
- Learning targets extraídos da capa da prova, com mapeamento
  questão → target proposto pela ferramenta e confirmado por ela.
- Report DP com Data Correlation (notas do Year 1 importadas + histórico de
  avaliações no app; MAP/CAT4 só se existirem — provavelmente não, param no G9),
  performance por learning target, forças, áreas, actionable steps e comentário
  Toddle autossuficiente.
- IA: acompanhamento de marcos por aluno, feedback no draft e correção da
  versão final contra os critérios A–E usando a rubric anotada dela
  (`specs/reference/exploration-rubric-sl-v1.4.txt`).

**Fora:**
- HL e Paper 3 (todas as turmas são SL este ano).
- Ingestão direta do Google Drive/Toddle (ela baixa o doc e sobe no app).
- Monitoramento de pastes / vídeo de escrita do IA (o Toddle já faz isso).
- Registro do IA no IBIS / moderação — a ferramenta para no mark /20 revisado.
- Benchmark cego agora — construir primeiro; ela traz provas corrigidas
  depois para validar (mesmo protocolo do MYP: comparar marks e grades com os
  dela antes de confiar).

## Requisitos

### Funcional — estrutura

- **P1.** Turma ganha campo de programa: `MYP` ou `DP`. Turmas DP têm curso
  (AI SL) e ano (Year 1 / Year 2). Tudo que já existe por turma (alunos,
  navegação, dashboard, perfis) funciona igual para DP.
- **P2.** Avaliação DP tem tipo `quiz` (formativo) ou `unit test` (somativo);
  os dois passam pelo mesmo pipeline completo.

### Funcional — setup de avaliação DP

- **P3.** Upload da prova (PDF ou .docx — ela tem os dois) e do **markscheme
  oficial em arquivo separado** (também PDF/.docx). O markscheme já vem editado
  por ela, sem as sub-partes de conteúdo não coberto: o total de marks da prova
  vem do que está no markscheme enviado, nunca de um original externo.
- **P4.** A ferramenta parseia o markscheme em: questões → sub-partes → lista
  de marks com a notação do IB preservada (**M1** método, **A1** accuracy,
  **R1** reasoning, **(M1)** implícito, sufixo **ft** follow-through, **AG**
  answer given), com max marks por sub-parte (`[2 marks]`), por questão
  (`[Total: 6 marks]`) e total da prova. O parse preserva por sub-parte:
  as **caixas de Note** (são vinculantes — mudam a concessão, ex.: "Do not
  award R0A1", "award A1A0 for part (a) if seen here"), os blocos de método
  alternativo (**METHOD 1 / METHOD 2** para a questão inteira,
  **EITHER … OR … THEN** dentro de partes) e as formas equivalentes entre
  parênteses após a resposta. Ela revê e pode corrigir o parse num editor
  antes de ativar a avaliação.
- **P4b.** Se o arquivo de markscheme incluir as páginas "Instructions to
  Examiners" (o padrão dos oficiais), a ferramenta as usa como regra da prova;
  a spec abaixo (P8) resume essas regras como default quando as páginas não
  vierem.
- **P5.** A capa da prova traz os learning targets (student-facing). A
  ferramenta os extrai e **propõe o mapeamento questão → learning target**;
  ela confirma/ajusta no setup (não digita do zero).
- **P6.** Tabela de **grade boundaries** (% → grade 1–7) editável por prova.
  Ela ajusta por prova, mas muda pouco: pré-preencher com a tabela da última
  avaliação DP como default.

### Funcional — correção

- **P7.** Scans iguais ao MYP: um PDF por aluno, nome manuscrito na página 1,
  prova corrigida à mão **ou em branco** — o corretor trabalha às cegas contra
  o markscheme em qualquer caso e não usa as marcas dela como fonte.
- **P8.** Julgamento **mark a mark** com evidência citada do trabalho do aluno
  para cada mark concedido ou negado, aplicando as regras das "Instructions to
  Examiners" do IB (verificadas no markscheme oficial May 2025 P1 TZ1 SL):
  - **Dependência M→A**: em geral não se concede A1 após M0 — A marks
    dependem dos M anteriores. `M1A1` na mesma linha = M1 pela tentativa de
    método + A1 pelos valores corretos. Dois ou mais A na mesma linha são
    independentes (A0A1A1 é possível). `A2`, `M2`, `A3` **não se dividem**
    salvo Note.
  - Marks **implícitos** `(M1)`: só concedidos se o trabalho correto é visto
    ou implicado pelo desenvolvimento/resposta subsequente.
  - **FT (follow-through)** — só se aplica depois de um erro: valor errado de
    uma parte usado corretamente em parte(s) seguinte(s) ganha os marks
    seguintes. Normalmente exige trabalho visível, **exceto** quando todos os
    marks da parte seguinte são de resposta/implícitos — aí a resposta correta
    (sobre o valor errado) basta. Dentro da mesma parte, após o erro não há
    mais A marks para trabalho que use o erro, mas M marks sim. Se o erro
    simplifica muito a questão → menos FT marks, a critério. Valor
    impossível (probabilidade > 1, sin θ = 1.5, não-inteiro onde se exige
    inteiro) → sem mark de resposta final. Contradizer dados do enunciado, ou
    falhar um "show that" e seguir com o próprio valor em vez do dado → sem
    FT. "their" no markscheme sinaliza que FT é esperado. Erro numa parte mas
    resposta correta na seguinte → conceder, **salvo** se o command term for
    "Hence" (sem "or otherwise"). Exceções de FT sempre podem vir em Note.
  - **FUW (further working)**: vista a resposta correta, trabalho posterior
    incorreto é ignorado — exceto se o valor incorreto posterior for usado
    numa parte seguinte: aí retém-se o A1 final da parte e concede-se FT
    adiante.
  - **MR (mis-read)**: aluno copia errado um valor do enunciado → penalizar
    uma única vez (reter o primeiro mark da parte, conceder o resto conforme
    o trabalho); copiar errado o próprio trabalho é erro, não MR; sem trabalho
    visível não se infere MR.
  - **AG** (answer given no enunciado): a resposta sozinha não vale nada; os
    marks dependem do desenvolvimento completo. Num "show that" não é preciso
    reescrever a linha do AG, salvo Note.
  - **Métodos alternativos**: seguir o caminho que o aluno tomou (METHOD 1/2,
    EITHER…OR); métodos fora do markscheme são corrigidos em paralelo com ele,
    salvo command term "Hence" estrito.
  - **Formas equivalentes**: aceitar notação internacional (1,9 = 1.9;
    1 000 = 1,000); notação de calculadora vale para M e A intermediários,
    **não** para resposta final.
  - **Precisão**: salvo indicação da questão, resposta final exata ou correta
    a **3 s.f. ou mais precisa** — o markscheme imprime o valor não
    arredondado entre parênteses (ex.: `4150 (4145.81…)`) e ambos valem;
    4 s.f. ou o valor cheio da calculadora, consistentes com o valor correto,
    ganham o mark. Perde o mark quem dá **menos** que 3 s.f., arredonda
    errado, ou desrespeita precisão **especificada na questão** (aí há um
    mark atrelado). Usar o valor de 3 s.f. em partes seguintes é aceitável.
    A marks intermediários não precisam de simplificação; finais devem
    completar a aritmética (√(25/4) → 5/2), mas fração não precisa estar em
    forma mínima (10/4 ok; 10/5 deve virar 2).
  - **Múltiplas soluções** para a mesma questão: corrigir apenas a
    **primeira** resposta, salvo indicação do aluno.
  - Caso ambíguo que as regras acima não resolvam → flag para decisão dela na
    revisão.
- **P9.** Regras permanentes dela que continuam valendo no DP: trabalho
  riscado é ignorado mesmo se correto (coincide com a regra oficial do IB,
  salvo nota explícita do aluno pedindo correção); nunca adivinhar caligrafia
  (flag de ilegível); conservador por padrão, com a segunda passada revisora
  só podendo baixar marks. A leniência de arredondamento dela é compatível
  com a regra de precisão do IB (P8): mais precisão que 3 s.f. ainda ganha o
  mark; só perde quem dá menos que 3 s.f., arredonda errado ou ignora
  precisão especificada na questão.
- **P10.** Placar: soma de marks → percentual → grade 1–7 pela tabela de
  boundaries da prova.

### Funcional — revisão

- **P11.** Tela de revisão no mesmo molde do MYP (colunas independentes
  PDF | resultado, prev/next por aluno, breadcrumbs, atalhos de teclado):
  **total de marks por questão no topo** (chips), e embaixo o **mark a mark**
  para checagem, cada mark virável individualmente (✓/✗). Percentual e grade
  recalculam ao vivo a cada ajuste.
- **P12.** Flags de ilegível e de ambiguidade (P8) aparecem para resolução
  igual ao MYP. Export .xlsx da avaliação com marks por questão, %, grade.

### Funcional — report DP

- **P13.** Mesma estrutura do MYP: Data Correlation, Strengths, Areas for
  Improvement, Actionable Steps, Feedback Comment. Correlação usa **notas do
  Year 1** (import via fonte PRIOR_GRADES existente) + histórico de avaliações
  DP no app + **performance por learning target** desta prova e das
  anteriores. MAP/CAT4 entram só se houver dados do aluno (param no G9; não
  esperar que existam).
- **P14.** Comentário Toddle autossuficiente na voz dela: ao menos uma força
  e ao menos um actionable step concreto (técnica nomeada). O que ela registra
  no Toddle: **grade 1–7 + comentário** — os dois prontos para colar.

### Funcional — IA (Mathematical Exploration)

- **P15.** Acompanhamento de processo por aluno com marcos:
  `tema proposto → tema aprovado → draft entregue → feedback dado →
  versão final entregue → corrigida`, com datas-alvo configuráveis por turma e
  visão de turma destacando quem está atrasado (também no dashboard).
- **P16.** Upload do trabalho (PDF ou .docx baixado do Google Doc). Por ser
  texto digitado, a pseudonimização é textual e local: nome do aluno removido/
  trocado pelo pseudônimo antes de qualquer prompt (mesmo guard de nomes do
  pipeline de provas).
- **P17.** **Feedback no draft** (a única rodada formal que o IB permite):
  análise critério a critério (A Presentation /4, B Mathematical
  Communication /4, C Personal Engagement /3, D Reflection /3, E Use of
  Mathematics /6) usando a rubric anotada dela como referência primária,
  apontando por critério o que já está forte, o que falta para subir de nível
  (com o descritor citado) e sugestões acionáveis — em texto que ela revisa e
  repassa ao aluno.
- **P18.** **Correção da versão final**: mark proposto por critério com
  **evidência citada do trabalho** (trecho/página) justificando o nível contra
  a rubric, total /20. Tela de revisão critério a critério com marks
  ajustáveis, no mesmo padrão de UX das provas.

### Não-funcional

- Mesmas regras duras do app: **nomes de alunos nunca vão para a nuvem** —
  pseudônimos em todo prompt, guard que lança erro antes do envio, máscara da
  página 1 nos scans, log de auditoria antes do spawn.
- IA via `claude` CLI headless na assinatura dela; sem API paga salvo se a
  acurácia exigir (decisão dela).
- Todo output voltado a aluno/Toddle em **inglês**; UI em inglês como o resto
  do app.
- Local-only: SQLite, arquivos em `data/` (fora do git).

### Entradas e saídas

| Entrada | Formato | Origem |
|---|---|---|
| Prova DP | PDF ou .docx | Questionbank, montada por ela (targets na capa) |
| Markscheme | PDF ou .docx separado | Oficial IB, editado por ela |
| Boundaries | tabela % → 1–7 no setup | ela, por prova |
| Scans | 1 PDF/aluno, corrigido ou em branco | scanner → como no MYP |
| Notas Year 1 | import PRIOR_GRADES existente | planilha dela |
| Draft/final do IA | PDF ou .docx | download do Google Doc |
| Rubric do IA | `specs/reference/exploration-rubric-sl-v1.4.txt` | checklist dela (já no repo) |

| Saída | Formato |
|---|---|
| Marks por questão + mark a mark com evidência | tela de revisão + .xlsx |
| % e grade 1–7 | tela + .xlsx + report |
| Report (correlação, targets, forças, áreas, steps) | tela, aprovável |
| Comentário Toddle | texto pronto para colar |
| Feedback de draft do IA | texto por critério, revisável |
| Marks do IA (A–E, /20) com evidência | tela de revisão |

## Edge cases

- **Markscheme com métodos alternativos** (METHOD 1/2, "EITHER…OR") → o
  corretor segue o caminho que o aluno tomou; nunca exigir os dois. Command
  term "Hence" estrito → só o método pedido.
- **Note contradiz a regra geral** → a Note vence; é regra local vinculante
  da sub-parte (ex.: "Do not award R0A1" liga o A à consistência com o R).
- **ft encadeado**: erro na parte (a) usado em (b) e (c) → conceder marks
  seguintes pelo processo correto sobre o valor errado; nunca penalizar o
  mesmo erro duas vezes. Erro que gera valor impossível (prob > 1) → sem mark
  de resposta final.
- **Mis-read**: aluno copia 3,2 do enunciado como 32 e resolve certo → retém
  só o primeiro mark da parte, concede o resto sobre o valor lido.
- **Resposta correta seguida de trabalho errado (FUW)** → ignorar o trabalho
  posterior; se o valor errado posterior alimenta a parte seguinte → reter o
  A1 final e dar FT adiante.
- **Duas respostas diferentes para a mesma questão** → corrigir a primeira,
  salvo indicação do aluno.
- **AG**: aluno só reescreve a resposta dada no enunciado sem desenvolvimento
  → zero marks na sub-parte.
- **Resposta correta sem trabalho** em questão que pede desenvolvimento e
  markscheme/Notes silenciosos → flag de ambiguidade para ela decidir na
  revisão (a regra geral do IB manda checar todo o working; full marks
  automáticos por resposta certa não existem).
- **Resposta final com mais de 3 s.f.** (ex.: 4145.81 quando o markscheme dá
  4150) → ganha o mark, desde que consistente com o valor correto.
- **Resposta final com menos de 3 s.f., arredondada errado, em notação de
  calculadora, ou fora da precisão que a questão especifica** → perde o A
  final; anotar no feedback como hábito a corrigir antes do exame real.
- **Percentual exatamente no corte** de boundary → pertence à faixa de cima
  (corte é inclusivo no limite inferior da faixa).
- **Parse do markscheme falha ou sai errado** → editor manual no setup; a
  avaliação não ativa até ela aprovar a estrutura de marks.
- **Capa sem learning targets legíveis** → setup pede que ela digite, como no
  MYP.
- **Aluno ausente / prova em branco** → mesmos estados do MYP (absent pulado
  na navegação; em branco = 0 marks, grade pela tabela, report registra o fato
  sem inventar análise).
- **Nome do aluno repetido em cabeçalho/rodapé do doc do IA** → a limpeza
  textual varre o documento inteiro, não só a primeira página; guard de nomes
  continua lançando erro se sobrar nome no prompt.
- **Draft do IA entregue fora do prazo** → marco fica vermelho no
  acompanhamento, nada bloqueia o upload.
- **MAP/CAT4 ausentes para aluno DP** → seção de correlação usa só Year 1 +
  histórico, sem mencionar dados que não existem.

## Definition of done

- [ ] Criar turma **DP AI SL Year 2** (e Year 1 fica disponível na criação) e
      importar roster de ~30 alunos.
- [ ] Setup de um unit test com prova + markscheme separados (.docx e PDF
      testados): parse mostra questões, sub-partes e marks com notação IB
      (M/A/R, implícitos, ft, AG) e ela consegue corrigir o parse à mão.
- [ ] Learning targets da capa extraídos e mapeamento questão → target
      proposto, confirmável no setup.
- [ ] Tabela de boundaries editável, pré-preenchida com a da prova anterior.
- [ ] Upload de scans reusa o pipeline de privacidade idêntico ao MYP
      (pseudônimo, máscara da pág. 1, guard de nomes, ai-log antes do spawn) —
      verificável no log de requests do Settings.
- [ ] Correção de uma prova de teste gera mark a mark com evidência; casos de
      ft, FUW, mis-read, trabalho riscado e precisão 3 s.f. se comportam
      conforme P8/P9 (um caso sintético de cada, verificado à mão).
- [ ] Revisão: totais por questão no topo, mark a mark com toggle individual,
      % e grade 1–7 recalculando ao vivo; prev/next e atalhos funcionam.
- [ ] Report DP completo com Year 1 + learning targets na correlação e
      comentário com ≥1 força + ≥1 actionable step concreto; grade + comentário
      prontos para o Toddle.
- [ ] Export .xlsx da avaliação DP com marks por questão, % e grade.
- [ ] IA: marcos por aluno com datas por turma e visão de atrasados.
- [ ] IA: upload de .docx/PDF → texto pseudonimizado localmente (nome varrido
      do documento inteiro); feedback de draft critério a critério baseado na
      rubric dela; correção final com mark por critério + evidência, total /20,
      ajustável na revisão.
- [ ] **Benchmark cego (posterior)**: quando ela subir provas DP corrigidas,
      comparar marks totais e grades 1–7 com os dela — mesmo protocolo de
      aceitação do MYP.

## Open questions

- Nenhuma bloqueante. A primeira tabela de boundaries real e o primeiro par
  prova+markscheme vêm dela quando começar a usar (o build usa material de
  exemplo até lá).
