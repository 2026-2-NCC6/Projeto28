# 🎾 MOTION TENNIS

> **Tecnologia que transforma cada jogada em evolução.**  
> Plataforma digital esportiva, tecnológica e gamificada de treinamento conectada a equipamento físico com sensores de impacto.

---

## 1. Visão Geral da Nova Versão

O **Motion Tennis** foi atualizado para uma arquitetura modular profissional com três áreas totalmente independentes e protegidas por autenticação com hash criptográfico (PBKDF2):

1. **Site Institucional (`/`)**: Página de produto esportivo que apresenta a tecnologia, os benefícios e o equipamento físico, com botão principal **ENTRAR** direcionando para `/login`.
2. **Área do Jogador (`/app/*`)**: Dashboard gamificado com modos de treino, sensores acústicos KY-037 integrados ao Arduino e setores de treino projetados, telemetria de precisão, evolução por atributos RPG, árvore de habilidades, conquistas, histórico e **Motion Tennis Academy**.
3. **Painel Administrativo (`/admin/*`)**: Gestão de múltiplos equipamentos físicos Motion Tennis, usuários, sessões, monitoramento de sensores e setores, relatórios estatísticos e configurações do sistema.

---

## 2. Contas e Credenciais de Demonstração

| Tipo de Usuário | Nome de Usuário | Senha | Acesso Permitido | Destino Pós-Login |
| :--- | :--- | :--- | :--- | :--- |
| **Jogador Normal** | `nicolas` | `nicolas123` | `/app/*` | `/app/dashboard` |
| **Administrador** | `admin` | `admin123` | `/admin/*` e `/app/*` | `/admin/overview` |

> 🔒 **Segurança**: Senhas são armazenadas utilizando salt criptográfico e hash PBKDF2 com 10.000 iterações. Rotas administrativas são estritamente protegidas por autenticação e autorização via token assinado. Se um jogador tentar acessar `/admin/*`, o acesso é bloqueado.

---

## 3. Estrutura de Rotas

```text
/                       → Site institucional / apresentação do produto
/login                  → Tela de login com seleção rápida de credenciais

/app                    → Área autenticada do atleta
/app/dashboard          → Dashboard limpo com XP, nível e modos de jogo
/app/play               → Arena de jogo (Treino Livre, Alvo Único, Apague Todos)
/app/statistics         → Estatísticas detalhadas com atalhos para a Academy
/app/evolution          → Evolução de atributos RPG e Árvore de Habilidades
/app/academy            → Motion Tennis Academy (6 categorias de técnicas)
/app/academy/:skill     → Aulas e conteúdos técnicos da habilidade ("VÍDEO EM BREVE")
/app/history            → Histórico completo de sessões e impactos
/app/achievements       → Conquistas e medalhas desbloqueadas
/app/profile            → Perfil do atleta e personalização

/admin                  → Painel de controle do gestor
/admin/overview         → Visão geral com KPIs, status e equipamentos
/admin/equipments       → Gestão de equipamentos Motion Tennis e associação de atletas
/admin/users            → Gestão de usuários, alteração de status e redefinição de senhas
/admin/sessions         → Histórico global de sessões de treino
/admin/sensors          → Monitoramento visual dos 11 sensores físicos fixos
/admin/reports          → Relatórios de desempenho, gráficos de tendência e filtros
/admin/settings         → Configurações de hardware, WebSocket, porta e manutenção
```

---

## 4. Hardware Físico & 11 Sensores Fixos

O alvo físico Motion Tennis possui **11 sensores fixos** distribuídos geometricamente:

```
[1] Canto Sup. Esq. (20, 20)      [2] Centro Sup. (50, 18)      [3] Canto Sup. Dir. (80, 20)
       \                                |                                /
        [4] Meio Esq. (36, 40)   [5] NA MOSCA (50, 40)   [6] Meio Dir. (64, 40)
                                        |
       [7] Canto Inf. Esq. (20, 62)      [8] Centro Méd. (50, 60)      [9] Canto Inf. Dir. (80, 62)
                                /       |       \
               [10] Base Esq. (35, 82)     [11] Base Dir. (65, 82)
```

- Cada sensor é representado por um **botão circular interativo**.
- Ao clicar em um sensor no modo de simulação (ou receber o sinal via hardware ESP32/Arduino), o impacto é registrado em tempo real com coordenadas, força, pontos e cálculo de XP.

---

## 5. Modos de Jogo Refatorados

1. **Treino Livre**: O jogador atinge qualquer um dos 11 sensores livremente. Cada acerto calcula a pontuação e bonifica a velocidade do impacto.
2. **Alvo Único**: O sistema sorteia um dos 11 sensores como alvo ativo piscante. Ao acertar, a pontuação é multiplicada, o sensor pisca em verde neon e um novo alvo é sorteado automaticamente.
3. **Apague Todos**: O jogador deve acertar e "apagar" todos os 11 sensores iluminados. Ao apagar o último, uma tela de celebração é exibida com estatísticas e botão para reiniciar o desafio.

---

## 6. Motion Tennis Academy (`/app/academy`)

Área educativa e técnica com 6 habilidades:
- **Precisão**
- **Consistência**
- **Velocidade**
- **Controle**
- **Reflexo**
- **Estratégia**

Cada módulo contém cards de aulas estruturadas com crachá **"VÍDEO EM BREVE"**, garantindo que não sejam exibidos links quebrados ou vídeos falsos. Ao clicar em "Como melhorar" na página de estatísticas ou na página de evolução, o atleta é redirecionado diretamente para o conteúdo específico daquela habilidade na Academy.

---

## 7. Como Executar

### Inicialização Rápida (Recomendada):
Dê um duplo clique no arquivo:
```cmd
iniciar.bat
```
ou execute o inicializador:
```cmd
SmartTennis.exe
```

O script inicializa o backend Node.js na porta `3000`, conecta o banco SQLite local (`server/database/smart_tennis.db`) e abre automaticamente o navegador em:
```
http://localhost:3000
```

### Executar Testes E2E:
```bash
node scripts/test_system.js
```
Todos os 9 testes automatizados validarão integridade de autenticação, proteção de rotas, sensores fixos, impactos, Academy e rotas do React Router.
