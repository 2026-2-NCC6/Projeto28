Projeto
Projeto Interdisciplinar – Smart Tennis Arena

Curso
Ciência da
Computação

Turma
6º Semestre
2026

Tema
Treinos gamificados de tênis com IoT, robótica, sensores e integração por
API

Título
Smart Tennis Arena

SMART TENNIS ARENA
Versão:PRÉVIA
Treinos Gamificados de Tênis com IoT, Robótica e Sensores
Projeto Interdisciplinar – 6º CCOMP – 2026

1. Apresentação do Projeto
A Smart Tennis Arena propõe às equipes do 6º semestre do curso de Ciência da Computação o
desenvolvimento de uma solução integrada de IoT e Robótica para criação e execução de treinos
gamificados de tênis. O projeto toma como referência máquinas lançadoras de bolas, como a
Spinshot  Plus-2  e  a  Spinshot  Player  (https://spinshotsports.com/),  que  permitem  configurar
exercícios  com  variações  de  velocidade,  rotação,  direção,  altura,  oscilação  e  intervalo  de
alimentação.  A  solução  acadêmica  deverá  transformar  essas  possibilidades  técnicas  em
experiências de treino adequadas a diferentes públicos, objetivos e níveis de habilidade.
A gamificação deverá ser planejada de acordo com o público-alvo. Um treinamento destinado
a  crianças  iniciantes  pode  utilizar  narrativas,  personagens,  alvos  coloridos,  sons,  fases  e
recompensas  lúdicas.  Para  adultos,  atletas  ou  praticantes  avançados,  a  experiência  poderá
priorizar  metas  de  precisão,  intensidade,  consistência,  tipos  de  golpe,  séries,  progressão  de
desempenho  e  comparação  de  resultados.  Cada  equipe  deverá  justificar  suas  escolhas  de
mecânicas de jogo, sensores, atuadores e indicadores de desempenho.
A SmartTennis já dispõe de uma plataforma com diferentes tipos de treino. Por isso, o sistema
desenvolvido  deverá  prever  integração  com  a  plataforma  mãe  por  meio  de  API,  permitindo
receber  a  definição  de  um  treino,  executá-lo  no  aplicativo  e  no  dispositivo  IoT  e  devolver
resultados e telemetria. A arquitetura também deverá ser preparada para um futuro marketplace,
no qual autores poderão publicar e remunerar treinos, sem que a implementação financeira seja
obrigatória no MVP.
A  integração  física  com  uma  máquina  comercial  somente  poderá  utilizar  interfaces
documentadas, autorizadas e seguras. Não faz parte do projeto desmontar equipamentos,
modificar  firmware,  contornar  proteções  ou  realizar  engenharia  reversa.  Quando  não
houver uma interface oficial disponível, a equipe deverá usar um simulador da máquina
ou uma camada de adaptação que represente seus comandos e respostas.

2. Objetivos
2.1 Objetivo Geral
Desenvolver  um  ecossistema  composto  por  aplicativo  mobile,  site/dashboard  web,  API  e
protótipo  IoT/robótico  capaz  de  executar  treinos  gamificados  de  tênis,  coletar  dados  de
sensores, apresentar feedback em tempo real e integrar-se à plataforma SmartTennis de forma
segura, documentada e extensível.

2.2 Objetivos Específicos

•  Identificar  públicos-alvo,  necessidades  de  treino,  motivações  e  critérios  de  sucesso  para

diferentes perfis de praticantes.

•  Projetar  mecânicas  de  gamificação  coerentes  com  idade,  nível  técnico,  objetivos,

acessibilidade e segurança.

•  Construir um aplicativo mobile para seleção, configuração, execução e acompanhamento

das sessões.

•  Construir um site/dashboard para criação, gestão, publicação, versionamento e análise dos

treinos.

•  Integrar  sensores  e  atuadores  a  um  módulo  de  processamento  embarcado,  produzindo

eventos e feedbacks em tempo real.

•  Modelar  o  comportamento  do  sistema  por  máquinas  de  estados  e  aplicar  técnicas  de

otimização e análise de complexidade.

•  Implementar  uma  API  documentada  para  consumo  dos  treinos  e  envio  dos  resultados  à

plataforma mãe.

•  Aplicar práticas de redes, segurança, privacidade, testes, observabilidade e tratamento de

falhas.

•  Estruturar a proposta como oportunidade de negócio, considerando mercado, concorrência,

modelo de receitas e futuro marketplace.

3. Escopo da Solução e Regras de Negócio

•  Cada treino deverá possuir público-alvo, objetivo, nível de dificuldade, duração estimada,
regras de pontuação, sequência de exercícios, parâmetros da máquina ou do simulador e
sensores necessários.

•  O aplicativo deverá receber os dados do treino pela API ou utilizar uma versão previamente

sincronizada, permitindo iniciar, pausar, retomar e encerrar a sessão.

•  Os  sensores  deverão  produzir  eventos  mensuráveis,  como  acerto  em  alvo,  presença  em
zona, deslocamento, tempo de reação, número de repetições ou outro indicador  definido
pela equipe.

•  A pontuação deverá ser calculada por regras transparentes, reproduzíveis e compatíveis com

a máquina de estados do treino.

•  O  sistema  deverá  registrar  a  sessão,  seus  parâmetros,  eventos,  resultados,  erros  e

interrupções relevantes.

•  O site deverá permitir que um autor ou treinador crie e teste um treino antes de publicá-lo,

mantendo versão e status.

•  Os dados de crianças e adolescentes deverão receber proteção reforçada, coleta mínima e

acesso restrito.

•  O modo de parada segura deverá interromper o treino e impedir novos comandos até que o

sistema seja explicitamente reiniciado.

•  O  MVP  poderá  usar  uma  máquina  simulada,  desde  que  o  fluxo  completo  de  dados  e

comandos seja demonstrado de ponta a ponta.

4. Requisitos Funcionais – Aplicativo Mobile e Site
Funcionalidade

Canal

ID

Descrição mínima

RF01

Mobile/Site

Autenticação e perfis

Permitir login, logout e controle de acesso para jogador, treinador/autor e
administrador.

RF02

Mobile

Perfil do praticante

Registrar nível, faixa etária, objetivos, preferências, restrições e histórico
necessário à personalização.

RF03

Mobile

Catálogo de treinos

Consultar e filtrar treinos disponibilizados pela plataforma mãe por
público, objetivo, duração, dificuldade e sensores requeridos.

RF04

Mobile

Detalhes e preparação

Exibir instruções, regras, equipamentos necessários, riscos, parâmetros e
critérios de pontuação antes da sessão.

RF05

Mobile/IoT

Pareamento de dispositivo

Localizar e conectar-se ao controlador IoT por meio autorizado, exibindo
status dos sensores e da comunicação.

RF06

Mobile

Execução da sessão

Iniciar, pausar, retomar e encerrar o treino, apresentando etapa atual,
tempo, pontuação, metas e feedback.

RF07

IoT

Aquisição de sensores

Ler os sensores definidos pela equipe e converter as medições em eventos
do treino com data e hora.

RF08

IoT

Controle de atuadores

Acionar LEDs, buzzer, display, motores, alvos ou outros atuadores para
orientar e recompensar o praticante.

RF09

IoT/API

Comandos da máquina ou
simulador

Executar comandos compatíveis com a interface autorizada ou com o
simulador, incluindo parâmetros do exercício.

RF10

Mobile/IoT

Pontuação gamificada

Calcular pontos, bônus, penalidades, níveis, séries, conquistas ou outros
elementos definidos no treino.

RF11

Mobile

Modos por público

Adaptar linguagem, feedback visual/sonoro, dificuldade e recompensas
para diferentes perfis, incluindo crianças e adultos.

RF12

Mobile

Resultado da sessão

Apresentar resumo com desempenho, metas atingidas, evolução, eventos
relevantes e recomendações.

RF13

Mobile/Site

Histórico e indicadores

Consultar sessões por período e treino, com métricas de precisão,
consistência, tempo, volume e progressão.

RF14

Site

Editor de treinos

Criar e editar treinos definindo sequência, estados, regras, parâmetros,
sensores, feedbacks e critérios de conclusão.

RF15

Site

Simulação e validação

Executar ou visualizar uma simulação do treino e validar regras antes da
publicação.

RF16

Site

Versionamento e publicação

Manter rascunho, revisão, versão publicada, data, autor, compatibilidade e
histórico de alterações.

RF17

Site

Gestão administrativa

Gerenciar usuários, dispositivos, categorias, permissões, treinos, sessões e
parâmetros gerais.

RF18

API

Consumo de treinos

Disponibilizar ou consumir contratos REST/JSON documentados para
consultar detalhes e versões de treinos.

RF19

API

Envio de resultados

Enviar à plataforma mãe o resumo da sessão e, quando autorizado, os
eventos e dados de telemetria.

RF20

Site/API

Metadados de marketplace

Registrar autoria, descrição comercial, categoria, compatibilidade, licença
e modelo de remuneração futuro, sem cobrança obrigatória no MVP.

RF21

Mobile/IoT

Operação offline

Permitir execução de treino previamente sincronizado e posterior envio
dos resultados quando a conexão for restabelecida.

RF22

Todos

Parada segura

Disponibilizar comando de emergência e estados de falha que interrompam
a execução e registrem o motivo.

RF23

Todos

Auditoria e logs

Registrar ações administrativas, publicação, autenticação, comandos,
falhas e eventos críticos.

5. Requisitos Não Funcionais – Aplicativo Mobile e Site

•  Segurança:  autenticação  segura,  autorização  por  perfil,  armazenamento  protegido  de
credenciais, validação de entradas, proteção contra OWASP Top 10, comunicação cifrada
e princípio do menor privilégio.

•  Cibersegurança  do  IoT:  identificação  do  dispositivo,  chaves  ou  tokens  protegidos,
atualização  controlada,  bloqueio  de  comandos  indevidos,  segmentação  de  rede  quando
aplicável e registro de incidentes.

•  Segurança física: parada de emergência, limites de operação, verificação de área segura,

tratamento de sensor inconsistente e comportamento previsível em falhas.

•  Desempenho: feedback local compatível com a dinâmica do treino; a equipe deverá definir

e medir metas de latência para eventos críticos.

•  Disponibilidade e resiliência: recuperação de conexão, reenvio idempotente, persistência

local temporária e degradação segura quando serviços estiverem indisponíveis.

•  Interoperabilidade:  contratos  de  API  versionados,  JSON  padronizado,  identificação  de

versões de treino e documentação OpenAPI.

•  Usabilidade  e  acessibilidade:  interfaces  responsivas,  linguagem  adequada  ao  público,
contraste,  legibilidade,  feedback  claro  e  alternativas  a  sinais  exclusivamente  sonoros  ou
visuais.

•  Privacidade  e  LGPD:  minimização  de  dados,  finalidade  explícita,  retenção  limitada,

proteção reforçada de menores e anonimização de demonstrações.

•  Manutenibilidade:  arquitetura  modular,  separação  de  responsabilidades,  código

documentado, testes automatizados, versionamento e instruções reproduzíveis.

•  Escalabilidade: capacidade de ampliar usuários, dispositivos, sessões e catálogo de treinos

sem redesenho completo da solução.

•  Observabilidade:  logs  estruturados,  métricas,  identificação  de  falhas  e  correlação  entre

sessão mobile, dispositivo IoT e API.

•  Compatibilidade: suporte aos navegadores atuais e às versões de Android/iOS definidas

pela equipe, além dos dispositivos embarcados escolhidos.

6. Tecnologias Sugeridas – Aplicativo Mobile, Site e IoT

•  Aplicativo mobile: Flutter/Dart, React Native/TypeScript, Kotlin para Android ou Swift

para iOS; armazenamento local seguro e bibliotecas de BLE/Wi-Fi quando aplicável.

•  Site/dashboard: HTML5, CSS3 e TypeScript com React, Angular ou Vue; biblioteca de

gráficos e componentes acessíveis.

•  Backend e API: Node.js com Express/NestJS, Java com Spring Boot ou .NET Web API;

OpenAPI/Swagger; Postman/Insomnia.

•  Banco  de  dados:  PostgreSQL  ou  MySQL  para  dados  transacionais;  banco  de  séries

temporais ou extensão equivalente como opção para telemetria.

•  Sistemas embarcados: Arduino, ESP32 ou Raspberry Pi, conforme requisitos de sensores,

conectividade e processamento.

•  Sensores  e  atuadores:  sensores  de  distância,  presença,  pressão,  movimento,  IMU,
RFID/NFC, alvos de contato, câmera quando autorizada; LEDs, buzzer, display, servos e
motores.

•  Comunicação: MQTT, HTTP/HTTPS, WebSocket, Bluetooth Low Energy e Wi-Fi, com

justificativa técnica e mecanismos de autenticação.

•  Segurança: OWASP ZAP, analisadores SAST, scanners de dependências, TLS, gestão de

segredos e análise de ameaças.

•  Modelagem e gestão: diagramas de blocos, UML, máquinas de estados, Figma, GitHub,

GitHub Project.

•  Implantação:  Docker  e  plataforma  de  nuvem  compatível,  com  variáveis  de  ambiente,

documentação e monitoramento básico.

7. Etapas do Projeto

•  Descoberta  e  pesquisa:  compreender  o  contexto  do  treino,  os  públicos,  as  dores,  a

oportunidade de mercado e as restrições técnicas e físicas.

•  Concepção  gamificada:  definir  objetivos,  jornada,  mecânicas,  pontuação,  feedback,

narrativa e critérios de sucesso para o público escolhido.

•  Arquitetura e modelagem: elaborar diagrama de blocos, fluxo de dados, contratos de API,

máquina de estados, backlog e estratégia de segurança.

•  Prototipação embarcada: montar circuitos, testar sensores e atuadores, medir sinais e validar

eventos básicos.

•  Construção incremental: desenvolver API, site, aplicativo e firmware/controle embarcado

em versões integráveis.

•  Integração:  conectar  aplicativo,  dispositivo  IoT,  simulador  ou  máquina  autorizada  e

plataforma mãe.

•  Testes  e  mitigação:  validar  requisitos,  latência,  conectividade,  segurança,  parada  segura,

usabilidade e integridade dos dados.

•  Validação  com  usuários  e  parceiro:  executar  sessões  controladas,  registrar  evidências,

analisar feedback e justificar ajustes.

•  Publicação  e  apresentação:  implantar  a  solução,  consolidar  documentação,  relatório  de

extensão, banner, pitch e demonstração.

8. Possíveis Extensões

•  Marketplace completo com licenciamento, avaliação, compra, assinatura e remuneração dos

autores de treinos.

•  Recomendação  adaptativa  de  treinos  com  base  no  histórico,  perfil  e  desempenho  do

praticante.

•  Visão  computacional  para  análise  de  postura,  trajetória  da  bola  e  execução  de  golpes,

respeitando privacidade e consentimento.

•  Integração com relógios, pulseiras, sensores corporais e dados fisiológicos.
•  Competições presenciais ou remotas, rankings, missões coletivas e eventos entre clubes.
•  Painel  avançado  para  treinadores  com  comparação  de  atletas,  planejamento  de  ciclos  e

alertas de evolução.

•  Gêmeo digital da quadra, dos sensores e da máquina para simulação e testes.
•  Compatibilidade com diferentes máquinas lançadoras e outros esportes de raquete.
•  Operação multimáquina e orquestração de treinos em academias ou centros esportivos.

9. Entregáveis Gerais e Critérios de Aceitação

•  Repositório versionado com código-fonte do aplicativo, site/backend e sistema embarcado,

histórico de commits e instruções de execução.

•  Documento  de  requisitos,  escopo,  regras  de  negócio,  critérios  de  aceitação  e  riscos  do

projeto.

•  Protótipos das interfaces e fluxos principais do aplicativo e do site.
•  Arquitetura, diagrama de blocos, fluxo de dados, contratos da API e máquinas de estados.
•  Protótipo  físico  ou  simulador  com  sensores,  atuadores  e  módulo  de  processamento

integrados.

•  Aplicativo mobile funcional para preparar, executar e acompanhar uma sessão gamificada.
•  Site/dashboard funcional para criar, gerenciar, publicar e analisar treinos.
•  API documentada e evidências de integração com a plataforma mãe ou mock compatível.
•  Relatórios de vulnerabilidades, mitigações e evidências de testes de segurança.
•  Plano  e  evidências  de  testes  funcionais,  integração,  usabilidade,  desempenho  e  parada

segura.

•  Análise da oportunidade, do mercado, da concorrência e do modelo de negócios da futura

startup/marketplace.

•  Sistema

em
Interdisciplinar/extensão, banner, pitch e demonstração.

implantado

acessível,

ambiente

relatório

final

do  Projeto

O  sistema  será  considerado  funcional  quando  for  possível  executar,  de  ponta  a  ponta,  o
seguinte cenário: um autor cria e publica um treino no site; o aplicativo obtém o treino pela
API; o praticante conecta o dispositivo IoT e inicia a sessão; sensores e atuadores geram
eventos e feedback; a máquina autorizada ou o simulador executa a sequência; o sistema
calcula a pontuação, permite parada segura, encerra a sessão e sincroniza os resultados para
consulta no site.

10. Entregáveis Intermediários por Unidade Curricular
As datas, pesos e formatos finais deverão ser confirmados no cronograma oficial dos professores. A matriz abaixo preserva o conteúdo fornecido para cada Unidade
Curricular e orienta a integração progressiva do Projeto Interdisciplinar.

Unidades
Curriculares

Entrega 1
(3,0 Pontos)
25/09 23:59:56

Entrega 2
(4,0 Pontos)
06/11 23:59:56

Apresentação
(3,0 Pontos)
Semana FECAP de Tecnologia
17,18,19,23 e 24 de Novembro

Inovação e
Empreendedorismo

A primeira entrega da disciplina de Inovação e Empreendedorismo, no sexto semestre do
curso  de  Ciências  da  Computação,  consiste  na  apresentação  estruturada  da  análise  da
oportunidade identificada pela equipe. Nesta etapa, espera-se que os estudantes demonstrem
que a ideia proposta não nasce apenas de uma intuição tecnológica, mas de uma compreensão
profunda de uma necessidade real, inclusive em uma perspectiva econômica. Para isso, o
ponto de partida deve ser um entendimento empático das pessoas envolvidas: quem são os
usuários ou clientes, quais são suas dores, frustrações, limitações e expectativas, e em que
contexto  o  problema  se  manifesta.  Essa  caracterização  deve  ir  além  de  descrições
superficiais, evidenciando que a equipe realizou observações, entrevistas ou outras formas
de  aproximação  com  a  realidade  do  público-alvo,  construindo  uma  narrativa  consistente
sobre o problema identificado.
Além  da  dimensão  qualitativa,  a  análise  da  oportunidade  exige  uma  fundamentação
quantitativa robusta. A equipe deverá estimar o TAM (Total Addressable Market), expresso
em reais, isto é, o valor total da demanda potencial existente caso a solução pudesse atender
100%  do  mercado,  desconsiderando  concorrência,  barreiras  geográficas  ou  restrições
operacionais. Mais importante do que apresentar um número isolado é explicitar, de forma
transparente e lógica, todo o racional utilizado para chegar a essa estimativa: quais dados
secundários foram utilizados, quais premissas foram adotadas, como foi calculado o número
de  potenciais  clientes  e  qual  o  ticket  médio  considerado.  O  docente  avaliará  a  coerência
metodológica, a consistência das fontes e a clareza na exposição das hipóteses assumidas.
Ainda no âmbito da compreensão da oportunidade, a equipe deverá apresentar uma análise
do cenário concorrencial. Isso significa mapear quem já atua nesse mercado, quais soluções
existentes  competem  direta  ou  indiretamente  com  a  proposta  e  de  que  forma  os  clientes
atualmente resolvem (ou contornam) o problema identificado. Essa análise deve evidenciar
que o grupo compreende que inovação não ocorre em um vazio competitivo, mas em um
ecossistema  no  qual  alternativas  já  estão  disponíveis,  ainda  que  imperfeitas.  A  reflexão
crítica  sobre  concorrentes,  substitutos  e  práticas  atuais  permitirá  avaliar  o  grau  de
diferenciação e o potencial estratégico da solução proposta.
A entrega deverá ser realizada em formato de slides ou PDF, com nível de detalhamento
suficiente para que o docente compreenda claramente o problema, o mercado e o contexto
competitivo, mesmo sem a presença da equipe para explicações adicionais. O material deve
apresentar argumentos bem estruturados, dados fundamentados e encadeamento lógico das
análises, demonstrando maturidade conceitual e rigor na avaliação da oportunidade antes de
avançar para o desenvolvimento da solução.

A  segunda  entrega  da  disciplina  corresponde  à  dimensão  estratégica  da  potencial  startup
construída a partir da oportunidade validada na fase anterior. Se, no primeiro momento, o
foco esteve na compreensão profunda do problema e na mensuração do mercado, agora o
desafio é demonstrar que a empresa a ser criada possui fundamentos estratégicos sólidos e
reais  condições  de  gerar  vantagem  competitiva  sustentável  e  sucesso  financeiro.  Em
essência, as equipes deverão responder de forma clara e argumentada à seguinte questão:
por que esta startup, e não outra, será capaz de capturar valor e obter rentabilidade nesse
mercado?
Para sustentar essa conclusão, o ponto de partida será a análise da atratividade da indústria
associada à oportunidade identificada. As equipes deverão aplicar os conceitos clássicos de
análise  estrutural  do  setor,  fundamentando-se  principalmente  no  modelo  das  5  Forças  de
Porter, proposto por Michael Porter. Isso implica examinar, com profundidade, o grau de
rivalidade entre concorrentes existentes, a ameaça de novos entrantes, o poder de barganha
de  clientes,  o  poder  de  barganha  de  fornecedores  e  a  ameaça  de  produtos  substitutos.  A
análise não deve ser meramente descritiva, mas crítica e fundamentada em dados, evidências
e  premissas  claras.  O  objetivo  é  responder  de  maneira  consistente  se  o  setor  apresenta
potencial  estrutural  de  rentabilidade  ou  se  impõe  barreiras  que  exigirão  estratégias
diferenciadas para viabilizar retornos financeiros atrativos.
A partir dessa compreensão estrutural, as equipes deverão apresentar o modelo de negócios
completo da startup utilizando o Business Model Canvas (BMC). Cada um dos blocos do
modelo — proposta de valor, segmentos de clientes, canais, relacionamento com clientes,
fontes de receita, recursos-chave, atividades-chave, parcerias-chave e estrutura de custos —
deverá  ser  descrito  com  clareza  e  argumentado  de  forma  consistente.  Não  se  trata  de
preencher  o canvas  de maneira  superficial, mas  de  demonstrar  coerência  interna  entre os
componentes,  explicando  como  as  escolhas  estratégicas  se  conectam  e  se  reforçam
mutuamente. A proposta de valor deve dialogar com a dor identificada na primeira entrega;
as  fontes  de  receita  devem  ser  compatíveis  com  o  perfil  do  cliente  e  com  o  tamanho  de
mercado estimado; a estrutura de custos deve refletir as atividades e recursos necessários; e
as parcerias devem ser justificadas à luz da lógica de criação e captura de valor.
Espera-se  que  o  time  apresente  tanto  argumentos  qualitativos  quanto  fundamentos
quantitativos  para  sustentar  o  modelo  proposto.  Sempre  que  possível,  projeções  iniciais,
estimativas  de  custos,  hipóteses  de  monetização  e  indicadores  econômicos  preliminares
devem  ser  explicitados,  acompanhados  do  racional  utilizado.  O  docente  avaliará  a
consistência  estratégica,  o  encadeamento  lógico  das  decisões  e  a  maturidade  analítica  do
grupo  ao  conectar  análise  industrial,  vantagem  competitiva  e  arquitetura  do  modelo  de
negócios.
A entrega deverá ser realizada em formato de slides, com densidade analítica suficiente para
permitir avaliação autônoma do material. É fundamental destacar que o docente não aceitará
trabalhos  baseados  exclusivamente  em  Inteligência  Artificial.  As  equipes  deverão
demonstrar autoria intelectual, reflexão própria, domínio conceitual e capacidade crítica na
aplicação dos frameworks estudados em sala. A IA pode ser utilizada como ferramenta de
apoio, mas jamais como substituto do pensamento estratégico do grupo.

Formato  de  entrega:  Banner  +  Demo
funcional + Pitch de 4 minutos.
Critérios: Correção do modelo formal,
clareza  e  evidência  de  validação  no
sistema.

Unidades
Curriculares

Redes de Computadores e
Cibersegurança

Sistemas Embarcados e
Robótica

Teoria da Computação e
Linguagens Formais

Entrega 1
(3,0 Pontos)
25/09 23:59:56

Entrega 2
(4,0 Pontos)
06/11 23:59:56

Apresentação
(3,0 Pontos)
Semana FECAP de Tecnologia
17,18,19,23 e 24 de Novembro

Requisitos: Entregar o relatório de vulnerabilidades do sistema e do código. Sistema
com  segurança  aplicada.  Formato  da  entrega:  Relatórios  em  PDF  e/ou  HTML,  e
código fonte.
Objetivo: Compreender como encontrar vulnerabilidades e documentar dentro de um
projeto.
Entrega 01 – Montagem e Testes de Circuitos Básicos
Após  as  aulas  de  eletrônica  básica  (fontes  de  energia,  resistores,  Lei  de  Ohm,
capacitores,  diodos,  transistores  e  portas  lógicas),  os  alunos  devem  montar  e  testar
circuitos  básicos  utilizando  protoboard,  componentes  discretos  e  Arduino.  Essa
entrega deve incluir:
Esquema do circuito (manual ou em software como Tinkercad/Fritzing).
Relatório  simples  descrevendo  os  testes  realizados  e  medições  básicas  (tensão,
corrente).

Requisitos:  Entrega  complementar  dos  relatórios  e  mitigações  implementadas  no
código  do  sistema.  Formato  da  entrega:  Relatórios  em  PDF  e/ou  HTML,  e  código
fonte.
Objetivo: Compreender como encontrar vulnerabilidades e documentar dentro de um
projeto.
Entrega 02 – Programação e Controle de Dispositivos no Arduino
Após as aulas de introdução ao Arduino IDE, variáveis, portas digitais e analógicas
(PWM),  estruturas  condicionais  e  repetição,  os  alunos  devem  desenvolver  um
programa que controle pelo menos um atuador (LED, motor, servo, buzzer) e leia pelo
menos um sensor. Essa entrega deve incluir:
Código-fonte comentado.
Descrição do funcionamento e lógica utilizada.
Evidência prática (foto ou vídeo do sistema funcionando).

Objetivo: modelar formalmente parte do comportamento do sistema desenvolvido no
PI, relacionando o projeto aos conceitos de linguagens formais, autômatos, expressões
regulares e gramáticas.
Entregar um arquivo em formato PDF contendo os seguintes itens:
1. Identificação dos estados do sistema
Identificar  e  descrever  os  principais  estados  possíveis  do  sistema,  indicando  o  que
cada estado representa.
2. Eventos (entradas)
Identificar  os  eventos,  comandos  ou  condições  que  provocam  mudanças  entre  os
estados do sistema.
3. Diagrama de estados
Representar graficamente o comportamento do sistema por meio de uma máquina de
estados, indicando os estados e as transições provocadas pelos eventos identificados.
4. Tabela de transições
Apresentar as transições do sistema, indicando, no mínimo, o estado atual, o evento
de entrada e o próximo estado.
5. Linguagem do sistema
Definir o conjunto de eventos ou comandos considerados na modelagem e apresentar
exemplos de sequências válidas reconhecidas pelo sistema.
6. Expressão Regular – quando aplicável
Construir uma expressão regular que represente padrões de comandos, mensagens ou
sequências de eventos utilizados pelo sistema.
7. Gramática
Elaborar  uma  gramática  que  represente  a  estrutura  dos  comandos,  mensagens  ou
sequências  de  eventos  definidos  para  o  sistema,  identificando  seus  principais
componentes.
8. Justificativa da modelagem
Explicar  como  os  estados,  eventos,  transições,  linguagem  e  demais  representações
formais desenvolvidas correspondem ao funcionamento do projeto.

Objetivo: documentar formalmente as regras de funcionamento do sistema, definindo
comportamentos esperados e restrições.
Entregar um arquivo em formato PDF contendo os seguintes itens:
1. Atualização da máquina de estados
Apresentar  o  diagrama  revisado,  caso  tenham  ocorrido  alterações  durante  o
desenvolvimento do projeto.
2. Descrição dos eventos
Relacionar todos os eventos que podem ocorrer no sistema.
3. Regras de funcionamento
Descrever as principais regras que controlam o comportamento do sistema.
Exemplo: "Se o sensor estiver desligado, nenhum alerta poderá ser enviado."
4. Pré e pós-condições
Definir, para as principais operações do sistema:
Pré-condições (o que deve ser verdadeiro antes da operação);
Pós-condições (o que deve ser verdadeiro após a operação).
5. Modelo computacional
Justificar  qual  modelo  estudado  representa  melhor  o  comportamento  do  sistema
(Autômato Finito, Autômato com Pilha ou Máquina de Turing), explicando a escolha.
6. Análise de decidibilidade
Indicar  exemplos  de  decisões  realizadas  pelo  sistema  (como  validar  comandos  ou
verificar condições) e explicar por que essas decisões podem ser realizadas de forma
determinística.

Unidades
Curriculares

Entrega 1
(3,0 Pontos)
25/09 23:59:56

Entrega 2
(4,0 Pontos)
06/11 23:59:56

Apresentação
(3,0 Pontos)
Semana FECAP de Tecnologia
17,18,19,23 e 24 de Novembro

Projeto Interdisciplinar:
IoT e Robótica

A  primeira  entrega  consiste  na  apresentação  da  proposta  técnica  do  sistema  a  ser
desenvolvido  pela  equipe  no  contexto  do  Projeto  Interdisciplinar.  O  objetivo  é
demonstrar  a  capacidade  de  estruturar  tecnicamente  a  solução  antes  da  etapa  de
implementação.
A equipe deverá entregar um documento contendo:
Descrição técnica do problema e delimitação do escopo da solução;
Diagrama  de  blocos  do  sistema  (sensores,  módulo  de  processamento,  atuadores  e
comunicação);
Definição do fluxo de dados (entrada → processamento → saída → registro);
Especificação dos principais requisitos funcionais e não funcionais;
Modelagem do comportamento do sistema por meio de Máquina de Estados;
Product Backlog inicial estruturado segundo o framework Scrum.

A  segunda  entrega  consiste  na  apresentação  da  implementação  final  do  sistema
proposto,  evidenciando  a  integração  entre  sensores,  módulo  de  processamento,
atuadores e comunicação.
Espera-se que a equipe demonstre a execução prática do projeto, validando técnica e
funcionalmente a solução planejada na Entrega 01.
A equipe deverá entregar um documento contendo:
Descrição  da  arquitetura  final  implementada  (com  eventuais  ajustes  em  relação  à
proposta inicial);
Código-fonte organizado e versionado;
Evidência da integração entre sensores, processamento e atuadores;
Demonstração do fluxo completo de dados e ações do sistema;
Registro dos testes realizados e validação dos requisitos;
Backlog final atualizado, indicando tarefas concluídas e pendentes;
Análise crítica das limitações do sistema e propostas de melhoria.

11. Cronograma Sugerido de Atividades

Etapa

Período sugerido

Atividades e resultados esperados

1. Descoberta e oportunidade

2. Gamificação e modelagem
3. Fundação embarcada

4. API e dados
5. Aplicativo e site

6. Integração ponta a ponta
7. Segurança e validação

8. Finalização

Semanas 1–2

Semanas 3–4
Semanas 5–6

Semanas 7–8
Semanas 9–10

Semanas 11–12
Semanas 13–14

Semanas 15–16

Públicos, problema, pesquisa com usuários, análise de mercado, concorrentes, escopo e critérios de sucesso.

Jornada, regras, pontuação, máquina de estados, arquitetura, fluxo de dados e Product Backlog.
Circuitos básicos, medições, sensores, atuadores, conectividade e protótipo de eventos.

Contratos, autenticação, persistência, catálogo de treinos, sessão e telemetria.
Fluxos principais, editor de treinos, execução da sessão, pontuação e histórico.

Aplicativo, API, site, IoT e máquina/simulador integrados, com sincronização de resultados.
Relatórios de vulnerabilidades, mitigações, testes, parada segura, desempenho e usabilidade.

Deploy, documentação, análise crítica, relatório de extensão, banner, demo e pitch.

12. Diretrizes para Apresentação Final

•  Apresentar o problema, o público-alvo, a oportunidade e o valor gerado pela solução.
•  Demonstrar o fluxo completo com treino publicado, consumo pela API, execução no aplicativo e no IoT, pontuação e sincronização dos resultados.

•  Evidenciar a contribuição de cada Unidade Curricular e as decisões técnicas, de segurança e de negócio.
•  Mostrar o dispositivo físico ou simulador, os sensores, atuadores, repositório, testes, relatórios, banner e sistema implantado.
•  Explicar limitações, riscos, interfaces não implementadas e próximos passos sem ocultar dependências da máquina comercial.
•  Respeitar o formato de banner, demo funcional e pitch de 4 minutos definido para a Semana FECAP de Tecnologia.

13. Referências de Apoio
SPINSHOT SPORTS. Spinshot Plus-2 Tennis Ball Machine. Disponível em: https://spinshotsports.com/products/spinshot-plus-2-tennis-ball-machine. Acesso em: 6 ago. 2026.
SPINSHOT SPORTS. Spinshot Player Tennis Ball Machine. Disponível em: https://spinshotsports.com/products/spinshot-player-tennis-ball-machine. Acesso em: 6 ago. 2026.
SPINSHOT SPORTS. Drill Maker App. Disponível em: https://spinshotsports.com/pages/drill-maker-app. Acesso em: 6 ago. 2026.
SPINSHOT SPORTS. Spinshot Tennis Machines. Disponível em: https://spinshotsports.com/pages/spinshot-tennis-machines. Acesso em: 6 ago. 2026.

