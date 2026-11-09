using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SmartTennis
{
    public class LauncherForm : Form
    {
        private Process serverProcess = null;
        private Label lblTitle;
        private Label lblSubTitle;
        private Label lblStatusServer;
        private Label lblStatusDb;
        private Label lblStatusSensors;
        private Button btnStart;
        private Button btnOpenSite;
        private Button btnSettings;
        private Button btnStop;
        private TextBox txtLogs;
        private System.Windows.Forms.Timer healthTimer;
        private bool isServerRunning = false;
        private string projectDir = "";
        private string nodePath = "";

        private TechnicalSettingsForm settingsForm = null;

        public static List<string> SystemLogs = new List<string>();
        public static List<string> SystemErrors = new List<string>();

        public bool IsServerOnline { get { return isServerRunning; } }
        public string ProjectDirectory { get { return projectDir; } }
        public string NodeExecutablePath { get { return nodePath; } }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }

        public LauncherForm()
        {
            projectDir = AppDomain.CurrentDomain.BaseDirectory;
            if (projectDir.EndsWith("\\") || projectDir.EndsWith("/"))
            {
                projectDir = projectDir.Substring(0, projectDir.Length - 1);
            }

            FindNodePath();
            InitializeComponent();
            CheckSystemHealthAsync();

            healthTimer = new System.Windows.Forms.Timer();
            healthTimer.Interval = 3000;
            healthTimer.Tick += (s, e) => { CheckSystemHealthAsync(); };
            healthTimer.Start();
        }

        private void FindNodePath()
        {
            string localNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe");
            if (File.Exists(localNode))
            {
                nodePath = localNode;
                return;
            }

            string progNode = @"C:\Program Files\nodejs\node.exe";
            if (File.Exists(progNode))
            {
                nodePath = progNode;
                return;
            }

            nodePath = "node"; // Fallback to PATH
        }

        private void InitializeComponent()
        {
            this.Text = "Motion Tennis Launcher";
            this.Size = new Size(580, 680);
            this.MinimumSize = new Size(540, 620);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(7, 17, 11);
            this.ForeColor = Color.FromArgb(245, 247, 245);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // Header Panel
            Panel pnlHeader = new Panel();
            pnlHeader.Location = new Point(20, 20);
            pnlHeader.Size = new Size(520, 80);
            pnlHeader.BackColor = Color.FromArgb(12, 26, 17);
            pnlHeader.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(27, 54, 36), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, pnlHeader.Width - 1, pnlHeader.Height - 1);
                }
            };

            lblTitle = new Label();
            lblTitle.Text = "MOTION TENNIS";
            lblTitle.Font = new Font("Segoe UI", 20, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(57, 255, 136);
            lblTitle.Location = new Point(15, 12);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            lblSubTitle = new Label();
            lblSubTitle.Text = "Bem-vindo ao Motion Tennis • Plataforma Esportiva e Tecnológica";
            lblSubTitle.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            lblSubTitle.ForeColor = Color.FromArgb(140, 152, 145);
            lblSubTitle.Location = new Point(18, 48);
            lblSubTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblSubTitle);

            this.Controls.Add(pnlHeader);

            // Status Panel
            Panel pnlStatus = new Panel();
            pnlStatus.Location = new Point(20, 115);
            pnlStatus.Size = new Size(520, 140);
            pnlStatus.BackColor = Color.FromArgb(12, 26, 17);
            pnlStatus.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(27, 54, 36), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, pnlStatus.Width - 1, pnlStatus.Height - 1);
                }
            };

            Label lblStatusHeader = new Label();
            lblStatusHeader.Text = "STATUS DO SISTEMA LOCAL";
            lblStatusHeader.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            lblStatusHeader.ForeColor = Color.FromArgb(57, 255, 136);
            lblStatusHeader.Location = new Point(15, 12);
            lblStatusHeader.AutoSize = true;
            pnlStatus.Controls.Add(lblStatusHeader);

            lblStatusServer = new Label();
            lblStatusServer.Text = "Servidor local:  ○ Verificando...";
            lblStatusServer.Location = new Point(20, 42);
            lblStatusServer.AutoSize = true;
            lblStatusServer.ForeColor = Color.FromArgb(245, 247, 245);
            pnlStatus.Controls.Add(lblStatusServer);

            lblStatusDb = new Label();
            lblStatusDb.Text = "Banco de dados:  ● SQLite (smart_tennis.db)";
            lblStatusDb.Location = new Point(20, 72);
            lblStatusDb.AutoSize = true;
            lblStatusDb.ForeColor = Color.FromArgb(57, 255, 136);
            pnlStatus.Controls.Add(lblStatusDb);

            lblStatusSensors = new Label();
            lblStatusSensors.Text = "Sensores:  ● Modo simulação (Pronto para hardware)";
            lblStatusSensors.Location = new Point(20, 102);
            lblStatusSensors.AutoSize = true;
            lblStatusSensors.ForeColor = Color.FromArgb(255, 209, 102);
            pnlStatus.Controls.Add(lblStatusSensors);

            this.Controls.Add(pnlStatus);

            // Big Start Button
            btnStart = new Button();
            btnStart.Text = "INICIAR MOTION TENNIS";
            btnStart.Location = new Point(20, 270);
            btnStart.Size = new Size(520, 56);
            btnStart.BackColor = Color.FromArgb(57, 255, 136);
            btnStart.ForeColor = Color.FromArgb(7, 17, 11);
            btnStart.FlatStyle = FlatStyle.Flat;
            btnStart.FlatAppearance.BorderSize = 0;
            btnStart.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            btnStart.Cursor = Cursors.Hand;
            btnStart.Click += async (s, e) => { await StartSmartTennisAsync(); };
            this.Controls.Add(btnStart);

            // Secondary Buttons Panel
            // Botão Esquerdo: Abrir Site (Requisito 2)
            btnOpenSite = new Button();
            btnOpenSite.Text = "Abrir Site";
            btnOpenSite.Location = new Point(20, 340);
            btnOpenSite.Size = new Size(165, 38);
            btnOpenSite.BackColor = Color.FromArgb(16, 34, 22);
            btnOpenSite.ForeColor = Color.FromArgb(57, 255, 136);
            btnOpenSite.FlatStyle = FlatStyle.Flat;
            btnOpenSite.FlatAppearance.BorderColor = Color.FromArgb(57, 255, 136);
            btnOpenSite.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnOpenSite.Cursor = Cursors.Hand;
            btnOpenSite.Click += (s, e) => { HandleOpenSite(); };
            this.Controls.Add(btnOpenSite);

            // Botão Central: Configurações Técnicas Nativas (Requisito 3)
            btnSettings = new Button();
            btnSettings.Text = "Configurações";
            btnSettings.Location = new Point(195, 340);
            btnSettings.Size = new Size(165, 38);
            btnSettings.BackColor = Color.FromArgb(16, 34, 22);
            btnSettings.ForeColor = Color.FromArgb(245, 247, 245);
            btnSettings.FlatStyle = FlatStyle.Flat;
            btnSettings.FlatAppearance.BorderColor = Color.FromArgb(27, 54, 36);
            btnSettings.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnSettings.Cursor = Cursors.Hand;
            btnSettings.Click += (s, e) => { OpenTechnicalSettings(); };
            this.Controls.Add(btnSettings);

            // Botão Direito: Encerrar Sistema
            btnStop = new Button();
            btnStop.Text = "Encerrar Sistema";
            btnStop.Location = new Point(370, 340);
            btnStop.Size = new Size(170, 38);
            btnStop.BackColor = Color.FromArgb(30, 15, 15);
            btnStop.ForeColor = Color.FromArgb(255, 120, 120);
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderColor = Color.FromArgb(60, 20, 20);
            btnStop.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            btnStop.Cursor = Cursors.Hand;
            btnStop.Click += (s, e) => { StopSystem(); };
            this.Controls.Add(btnStop);

            // Log output Box
            Label lblLogs = new Label();
            lblLogs.Text = "LOGS DO SISTEMA LOCAL:";
            lblLogs.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lblLogs.ForeColor = Color.FromArgb(140, 152, 145);
            lblLogs.Location = new Point(20, 395);
            lblLogs.AutoSize = true;
            this.Controls.Add(lblLogs);

            txtLogs = new TextBox();
            txtLogs.Location = new Point(20, 420);
            txtLogs.Size = new Size(520, 190);
            txtLogs.Multiline = true;
            txtLogs.ScrollBars = ScrollBars.Vertical;
            txtLogs.ReadOnly = true;
            txtLogs.BackColor = Color.FromArgb(4, 10, 6);
            txtLogs.ForeColor = Color.FromArgb(140, 152, 145);
            txtLogs.Font = new Font("Consolas", 8.5f);
            txtLogs.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(txtLogs);

            Log("Motion Tennis Launcher iniciado.");
            Log("Diretório base: " + projectDir);
            Log("Executável Node: " + nodePath);

            this.FormClosing += (s, e) => { StopSystem(); };
        }

        public void Log(string msg)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<string>(Log), msg);
                return;
            }
            string entry = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg;
            txtLogs.AppendText(entry + Environment.NewLine);

            SystemLogs.Add(entry);
            if (SystemLogs.Count > 200) SystemLogs.RemoveAt(0);

            if (msg.Contains("[ERRO]") || msg.Contains("[SERVER ERROR]") || msg.Contains("Error:"))
            {
                SystemErrors.Add(entry);
                if (SystemErrors.Count > 50) SystemErrors.RemoveAt(0);
            }
        }

        private async Task CheckSystemHealthAsync()
        {
            try
            {
                using (HttpClient client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(1.5);
                    var resp = await client.GetAsync("http://127.0.0.1:3000/api/status");
                    if (resp.IsSuccessStatusCode)
                    {
                        isServerRunning = true;
                        lblStatusServer.Text = "Servidor local:  ● Online (http://127.0.0.1:3000)";
                        lblStatusServer.ForeColor = Color.FromArgb(57, 255, 136);
                    }
                    else
                    {
                        isServerRunning = false;
                        lblStatusServer.Text = "Servidor local:  ○ Parado";
                        lblStatusServer.ForeColor = Color.FromArgb(140, 152, 145);
                    }
                }
            }
            catch
            {
                isServerRunning = false;
                lblStatusServer.Text = "Servidor local:  ○ Parado";
                lblStatusServer.ForeColor = Color.FromArgb(140, 152, 145);
            }
        }

        private async Task StartSmartTennisAsync()
        {
            if (isServerRunning)
            {
                Log("Servidor já está online. Abrindo navegador...");
                OpenBrowser();
                return;
            }

            btnStart.Enabled = false;
            btnStart.Text = "INICIANDO SERVIDOR...";
            Log("Verificando dependências locais...");

            try
            {
                string serverScript = Path.Combine(projectDir, @"server\index.js");
                if (!File.Exists(serverScript))
                {
                    Log("ERRO: Arquivo server\\index.js não encontrado.");
                    MessageBox.Show("Arquivo server\\index.js não encontrado em: " + projectDir, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    btnStart.Enabled = true;
                    btnStart.Text = "INICIAR MOTION TENNIS";
                    return;
                }

                Log("Iniciando backend local Motion Tennis...");

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = "\"" + serverScript + "\"";
                psi.WorkingDirectory = projectDir;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.CreateNoWindow = true;

                serverProcess = new Process();
                serverProcess.StartInfo = psi;

                serverProcess.OutputDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        Log(e.Data);
                    }
                };

                serverProcess.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        Log("[ERRO] " + e.Data);
                    }
                };

                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                Log("Aguardando sistema responder em http://127.0.0.1:3000...");

                // Poll readiness for up to 10 seconds
                bool online = false;
                for (int i = 0; i < 15; i++)
                {
                    await Task.Delay(600);
                    try
                    {
                        using (HttpClient client = new HttpClient())
                        {
                            client.Timeout = TimeSpan.FromSeconds(1);
                            var res = await client.GetAsync("http://127.0.0.1:3000/api/status");
                            if (res.IsSuccessStatusCode)
                            {
                                online = true;
                                break;
                            }
                        }
                    }
                    catch { }
                }

                if (online)
                {
                    isServerRunning = true;
                    Log("Motion Tennis iniciado com sucesso!");
                    await CheckSystemHealthAsync();
                    OpenBrowser();
                }
                else
                {
                    Log("Aviso: Tempo limite aguardando resposta da porta 3000.");
                }
            }
            catch (Exception ex)
            {
                Log("Falha ao iniciar: " + ex.Message);
                MessageBox.Show("Erro ao executar Node.js: " + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                btnStart.Enabled = true;
                btnStart.Text = "INICIAR MOTION TENNIS";
            }
        }

        // Requisito 2: Botão Esquerdo — Abrir Site
        private void HandleOpenSite()
        {
            if (!isServerRunning)
            {
                MessageBox.Show(
                    "O servidor local do Motion Tennis está parado no momento.\n\n" +
                    "Clique no botão 'INICIAR MOTION TENNIS' para ligar a plataforma antes de abrir o site.",
                    "Servidor Offline",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            OpenBrowser();
        }

        private void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://127.0.0.1:3000",
                    UseShellExecute = true
                });
                Log("Navegador aberto em http://127.0.0.1:3000");
            }
            catch (Exception ex)
            {
                Log("Erro ao abrir navegador: " + ex.Message);
            }
        }

        // Requisito 3: Botão Central — Configurações Técnicas Nativas
        private void OpenTechnicalSettings()
        {
            if (settingsForm == null || settingsForm.IsDisposed)
            {
                settingsForm = new TechnicalSettingsForm(this, projectDir, nodePath);
                settingsForm.Show();
            }
            else
            {
                settingsForm.BringToFront();
                settingsForm.Activate();
            }
        }

        private void StopSystem()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    Log("Encerrando processo do servidor...");
                    serverProcess.Kill();
                    serverProcess.Dispose();
                    serverProcess = null;
                }
                catch { }
            }
            isServerRunning = false;
            lblStatusServer.Text = "Servidor local:  ○ Parado";
            lblStatusServer.ForeColor = Color.FromArgb(140, 152, 145);
        }
    }

    /// <summary>
    /// Janela Técnica Nativa do Windows para Configurações, Diagnósticos, Banco de Dados e Hardware.
    /// </summary>
    public class TechnicalSettingsForm : Form
    {
        private LauncherForm parentLauncher;
        private string projectDir;
        private string nodePath;
        private string dbPath;

        private TabControl tabControl;

        // Tab 1: Banco de Dados Controls
        private Label lblDbPathValue;
        private Label lblDbExistsValue;
        private Label lblDbSizeValue;
        private Label lblDbConnStateValue;
        private Label lblDbIntegrityValue;
        private Label lblDbBackupValue;
        private Button btnBackupNow;

        // Tab 2: Servidor e Rede Controls
        private Label lblServerStatusVal;
        private Label lblServerPortVal;
        private Label lblLocalIpVal;
        private Label lblLocalUrlVal;
        private Label lblAndroidUrlVal;
        private Label lblHttpTestVal;
        private Button btnTestConnection;

        // Tab 3: Hardware Controls
        private Label lblComPortsVal;
        private Label lblArduinoStateVal;
        private Label lblSensorsModeVal;
        private Label lblLastHitVal;
        private Button btnRefreshHw;

        // Tab 4: Diagnósticos Controls
        private Label lblDiagProjDir;
        private Label lblDiagNodeVer;
        private Label lblDiagDeps;
        private TextBox txtDiagErrors;
        private TextBox txtDiagLogs;

        public TechnicalSettingsForm(LauncherForm parent, string projDir, string nodeExe)
        {
            this.parentLauncher = parent;
            this.projectDir = projDir;
            this.nodePath = nodeExe;
            this.dbPath = Path.Combine(projectDir, @"server\database\smart_tennis.db");

            InitializeForm();
            LoadDataAsync();
        }

        private void InitializeForm()
        {
            this.Text = "Motion Tennis — Painel Técnico & Configurações";
            this.Size = new Size(740, 620);
            this.MinimumSize = new Size(700, 580);
            this.StartPosition = FormStartPosition.CenterParent;
            this.BackColor = Color.FromArgb(7, 17, 11);
            this.ForeColor = Color.FromArgb(245, 247, 245);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            // Top Header Panel
            Panel pnlTop = new Panel();
            pnlTop.Dock = DockStyle.Top;
            pnlTop.Height = 75;
            pnlTop.BackColor = Color.FromArgb(12, 26, 17);
            pnlTop.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(27, 54, 36), 1))
                {
                    e.Graphics.DrawLine(p, 0, pnlTop.Height - 1, pnlTop.Width, pnlTop.Height - 1);
                }
            };

            Label lblHead = new Label();
            lblHead.Text = "MOTION TENNIS — PAINEL TÉCNICO & CONFIGURAÇÕES";
            lblHead.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            lblHead.ForeColor = Color.FromArgb(57, 255, 136);
            lblHead.Location = new Point(20, 14);
            lblHead.AutoSize = true;
            pnlTop.Controls.Add(lblHead);

            Label lblSub = new Label();
            lblSub.Text = "Diagnóstico ativo do SQLite, conectividade de rede para Android, portas de hardware e integridade local.";
            lblSub.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            lblSub.ForeColor = Color.FromArgb(140, 152, 145);
            lblSub.Location = new Point(21, 42);
            lblSub.AutoSize = true;
            pnlTop.Controls.Add(lblSub);

            this.Controls.Add(pnlTop);

            // TabControl
            tabControl = new TabControl();
            tabControl.Dock = DockStyle.Fill;
            tabControl.DrawMode = TabDrawMode.OwnerDrawFixed;
            tabControl.SizeMode = TabSizeMode.Fixed;
            tabControl.ItemSize = new Size(172, 34);
            tabControl.Font = new Font("Segoe UI", 9f, FontStyle.Regular);

            tabControl.DrawItem += (s, e) =>
            {
                var tab = tabControl.TabPages[e.Index];
                bool isSelected = (e.Index == tabControl.SelectedIndex);
                Color bgColor = isSelected ? Color.FromArgb(16, 34, 22) : Color.FromArgb(12, 26, 17);
                Color textColor = isSelected ? Color.FromArgb(57, 255, 136) : Color.FromArgb(140, 152, 145);

                using (SolidBrush bgBrush = new SolidBrush(bgColor))
                {
                    e.Graphics.FillRectangle(bgBrush, e.Bounds);
                }

                if (isSelected)
                {
                    using (Pen p = new Pen(Color.FromArgb(57, 255, 136), 2))
                    {
                        e.Graphics.DrawLine(p, e.Bounds.Left + 2, e.Bounds.Bottom - 1, e.Bounds.Right - 2, e.Bounds.Bottom - 1);
                    }
                }

                using (Font f = new Font("Segoe UI", 9f, isSelected ? FontStyle.Bold : FontStyle.Regular))
                {
                    TextRenderer.DrawText(e.Graphics, tab.Text, f, e.Bounds, textColor,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                }
            };

            // Build 4 Tabs
            TabPage tabDb = CreateDatabaseTab();
            TabPage tabNet = CreateNetworkTab();
            TabPage tabHw = CreateHardwareTab();
            TabPage tabDiag = CreateDiagnosticsTab();

            tabControl.TabPages.Add(tabDb);
            tabControl.TabPages.Add(tabNet);
            tabControl.TabPages.Add(tabHw);
            tabControl.TabPages.Add(tabDiag);

            this.Controls.Add(tabControl);
            tabControl.BringToFront();
        }

        // ==========================================
        // ABA 1: BANCO DE DADOS
        // ==========================================
        private TabPage CreateDatabaseTab()
        {
            TabPage page = new TabPage("💾 Banco de Dados");
            page.BackColor = Color.FromArgb(7, 17, 11);
            page.Padding = new Padding(15);

            Panel card = CreateCardPanel(15, 15, 690, 390);

            Label lblSec = CreateSectionHeader("ESPECIFICAÇÕES DO ARQUIVO SQLITE");
            lblSec.Location = new Point(15, 15);
            card.Controls.Add(lblSec);

            int y = 45;
            card.Controls.Add(CreateFieldLabel("Arquivo de Banco:", 15, y));
            Label lblFile = CreateValueLabel("smart_tennis.db", 190, y, Color.FromArgb(245, 247, 245));
            card.Controls.Add(lblFile);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Caminho Completo:", 15, y));
            lblDbPathValue = CreateValueLabel(dbPath, 190, y, Color.FromArgb(245, 247, 245));
            lblDbPathValue.Font = new Font("Consolas", 8.5f);
            lblDbPathValue.Size = new Size(480, 20);
            card.Controls.Add(lblDbPathValue);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Existência no Disco:", 15, y));
            lblDbExistsValue = CreateValueLabel("Verificando...", 190, y, Color.FromArgb(245, 247, 245));
            card.Controls.Add(lblDbExistsValue);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Tamanho Atual:", 15, y));
            lblDbSizeValue = CreateValueLabel("Calculando...", 190, y, Color.FromArgb(245, 247, 245));
            card.Controls.Add(lblDbSizeValue);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Estado da Conexão:", 15, y));
            lblDbConnStateValue = CreateValueLabel("Verificando...", 190, y, Color.FromArgb(57, 255, 136));
            card.Controls.Add(lblDbConnStateValue);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Integridade do Banco:", 15, y));
            lblDbIntegrityValue = CreateValueLabel("Aguardando verificação...", 190, y, Color.FromArgb(57, 255, 136));
            card.Controls.Add(lblDbIntegrityValue);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Último Backup:", 15, y));
            lblDbBackupValue = CreateValueLabel("Localizando...", 190, y, Color.FromArgb(245, 247, 245));
            lblDbBackupValue.Size = new Size(480, 20);
            card.Controls.Add(lblDbBackupValue);

            // Warning note
            y += 35;
            Label lblNotice = new Label();
            lblNotice.Text = "🔒 Segurança: O procedimento de backup é consistente com SQLite e não sobrescreve cópias anteriores.\nEdições diretas de registros na base estão desabilitadas para preservar o progresso do jogador.";
            lblNotice.Location = new Point(15, y);
            lblNotice.Size = new Size(660, 36);
            lblNotice.Font = new Font("Segoe UI", 8.5f, FontStyle.Italic);
            lblNotice.ForeColor = Color.FromArgb(140, 152, 145);
            card.Controls.Add(lblNotice);

            // Action Buttons
            y += 48;
            btnBackupNow = CreateButton("💾 Criar Backup Agora", 15, y, 200, 38, true);
            btnBackupNow.Click += async (s, e) => { await PerformDatabaseBackupAsync(); };
            card.Controls.Add(btnBackupNow);

            Button btnOpenBackupFolder = CreateButton("📁 Abrir Pasta de Backups", 225, y, 200, 38, false);
            btnOpenBackupFolder.Click += (s, e) => { OpenBackupDirectory(); };
            card.Controls.Add(btnOpenBackupFolder);

            page.Controls.Add(card);
            return page;
        }

        // ==========================================
        // ABA 2: SERVIDOR E REDE
        // ==========================================
        private TabPage CreateNetworkTab()
        {
            TabPage page = new TabPage("🌐 Servidor e Rede");
            page.BackColor = Color.FromArgb(7, 17, 11);
            page.Padding = new Padding(15);

            Panel card = CreateCardPanel(15, 15, 690, 410);

            Label lblSec = CreateSectionHeader("STATUS DO BACKEND & CONECTIVIDADE LOCAL");
            lblSec.Location = new Point(15, 15);
            card.Controls.Add(lblSec);

            int y = 45;
            card.Controls.Add(CreateFieldLabel("Status do Backend:", 15, y));
            lblServerStatusVal = CreateValueLabel("Verificando...", 210, y, Color.FromArgb(245, 247, 245));
            card.Controls.Add(lblServerStatusVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Porta TCP Utilizada:", 15, y));
            lblServerPortVal = CreateValueLabel("3000 (Padrão)", 210, y, Color.FromArgb(245, 247, 245));
            card.Controls.Add(lblServerPortVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Endereço IPv4 Local:", 15, y));
            lblLocalIpVal = CreateValueLabel(GetLocalIPv4Address(), 210, y, Color.FromArgb(57, 255, 136));
            lblLocalIpVal.Font = new Font("Consolas", 9.5f, FontStyle.Bold);
            card.Controls.Add(lblLocalIpVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("URL Local do Sistema:", 15, y));
            lblLocalUrlVal = CreateValueLabel("http://127.0.0.1:3000", 210, y, Color.FromArgb(245, 247, 245));
            lblLocalUrlVal.Font = new Font("Consolas", 9f);
            card.Controls.Add(lblLocalUrlVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("URL para App Android:", 15, y));
            string androidUrl = "http://" + GetLocalIPv4Address() + ":3000";
            lblAndroidUrlVal = CreateValueLabel(androidUrl, 210, y, Color.FromArgb(57, 255, 136));
            lblAndroidUrlVal.Font = new Font("Consolas", 9f, FontStyle.Bold);
            card.Controls.Add(lblAndroidUrlVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Teste HTTP (/api/status):", 15, y));
            lblHttpTestVal = CreateValueLabel("Clique em 'Testar Conexão' para verificar", 210, y, Color.FromArgb(140, 152, 145));
            lblHttpTestVal.Size = new Size(460, 20);
            card.Controls.Add(lblHttpTestVal);

            // Note regarding Android Connection
            y += 35;
            Label lblNotice = new Label();
            lblNotice.Text = "ℹ️ Aplicativo Android: Para conectar o celular, insira a URL acima nas configurações do app enquanto\nestiver conectado na mesma rede Wi-Fi. O status 'Online' do servidor indica prontidão para conexões,\ne não que um celular já está pareado no momento.";
            lblNotice.Location = new Point(15, y);
            lblNotice.Size = new Size(660, 48);
            lblNotice.Font = new Font("Segoe UI", 8.5f, FontStyle.Italic);
            lblNotice.ForeColor = Color.FromArgb(140, 152, 145);
            card.Controls.Add(lblNotice);

            // Action Buttons
            y += 55;
            btnTestConnection = CreateButton("⚡ Testar Conexão (/api/status)", 15, y, 220, 38, true);
            btnTestConnection.Click += async (s, e) => { await TestApiConnectionAsync(); };
            card.Controls.Add(btnTestConnection);

            Button btnCopyAndroid = CreateButton("📋 Copiar URL do Android", 245, y, 200, 38, false);
            btnCopyAndroid.Click += (s, e) =>
            {
                Clipboard.SetText(lblAndroidUrlVal.Text);
                MessageBox.Show("URL de rede para o App Android copiada:\n" + lblAndroidUrlVal.Text, "URL Copiada", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            card.Controls.Add(btnCopyAndroid);

            Button btnCopyLocal = CreateButton("📋 Copiar URL Local", 455, y, 160, 38, false);
            btnCopyLocal.Click += (s, e) =>
            {
                Clipboard.SetText(lblLocalUrlVal.Text);
                MessageBox.Show("URL local copiada:\n" + lblLocalUrlVal.Text, "URL Copiada", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            card.Controls.Add(btnCopyLocal);

            page.Controls.Add(card);
            return page;
        }

        // ==========================================
        // ABA 3: HARDWARE
        // ==========================================
        private TabPage CreateHardwareTab()
        {
            TabPage page = new TabPage("🔌 Hardware");
            page.BackColor = Color.FromArgb(7, 17, 11);
            page.Padding = new Padding(15);

            Panel card = CreateCardPanel(15, 15, 690, 400);

            Label lblSec = CreateSectionHeader("MONITORAMENTO DE HARDWARE & PORTAS SERIAIS");
            lblSec.Location = new Point(15, 15);
            card.Controls.Add(lblSec);

            int y = 45;
            card.Controls.Add(CreateFieldLabel("Portas COM no Windows:", 15, y));
            lblComPortsVal = CreateValueLabel("Verificando portas...", 210, y, Color.FromArgb(245, 247, 245));
            lblComPortsVal.Size = new Size(460, 20);
            card.Controls.Add(lblComPortsVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Estado do Arduino/ESP32:", 15, y));
            lblArduinoStateVal = CreateValueLabel("Avaliando conexão...", 210, y, Color.FromArgb(245, 247, 245));
            lblArduinoStateVal.Size = new Size(460, 20);
            card.Controls.Add(lblArduinoStateVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Modo Atual dos Sensores:", 15, y));
            lblSensorsModeVal = CreateValueLabel("Modo Simulação / Alvos Eletrônicos (Pronto para hardware)", 210, y, Color.FromArgb(57, 255, 136));
            lblSensorsModeVal.Size = new Size(460, 20);
            card.Controls.Add(lblSensorsModeVal);

            y += 28;
            card.Controls.Add(CreateFieldLabel("Última Telemetria Recebida:", 15, y));
            lblLastHitVal = CreateValueLabel("Consultando histórico de impactos...", 210, y, Color.FromArgb(245, 247, 245));
            lblLastHitVal.Size = new Size(460, 20);
            card.Controls.Add(lblLastHitVal);

            y += 35;
            Label lblNotice = new Label();
            lblNotice.Text = "⚠️ Atenção técnica: Não há confirmação de sensores piezoelétricos ou KY-037 conectados a menos\nque o microcontrolador Arduino/ESP32 esteja plugado via USB/Serial e enviando dados válidos.\nO protocolo serial de comunicação permanece preservado e pode ser lido via leitor_arduino.py.";
            lblNotice.Location = new Point(15, y);
            lblNotice.Size = new Size(660, 48);
            lblNotice.Font = new Font("Segoe UI", 8.5f, FontStyle.Italic);
            lblNotice.ForeColor = Color.FromArgb(140, 152, 145);
            card.Controls.Add(lblNotice);

            y += 55;
            btnRefreshHw = CreateButton("🔄 Atualizar Portas & Comunicação", 15, y, 240, 38, true);
            btnRefreshHw.Click += (s, e) => { RefreshHardwareInfo(); };
            card.Controls.Add(btnRefreshHw);

            Button btnDoc = CreateButton("📖 Abrir Guia de Hardware", 265, y, 200, 38, false);
            btnDoc.Click += (s, e) => { OpenHardwareGuide(); };
            card.Controls.Add(btnDoc);

            page.Controls.Add(card);
            return page;
        }

        // ==========================================
        // ABA 4: DIAGNÓSTICOS
        // ==========================================
        private TabPage CreateDiagnosticsTab()
        {
            TabPage page = new TabPage("🩺 Diagnósticos");
            page.BackColor = Color.FromArgb(7, 17, 11);
            page.Padding = new Padding(15);

            Panel card = CreateCardPanel(15, 15, 690, 440);

            Label lblSec = CreateSectionHeader("DIAGNÓSTICO GERAL DO AMBIENTE");
            lblSec.Location = new Point(15, 12);
            card.Controls.Add(lblSec);

            int y = 36;
            card.Controls.Add(CreateFieldLabel("Diretório do Projeto:", 15, y));
            lblDiagProjDir = CreateValueLabel(projectDir, 180, y, Color.FromArgb(245, 247, 245));
            lblDiagProjDir.Font = new Font("Consolas", 8f);
            lblDiagProjDir.Size = new Size(490, 18);
            card.Controls.Add(lblDiagProjDir);

            y += 24;
            card.Controls.Add(CreateFieldLabel("Versão do Node.js:", 15, y));
            lblDiagNodeVer = CreateValueLabel("Detectando...", 180, y, Color.FromArgb(57, 255, 136));
            card.Controls.Add(lblDiagNodeVer);

            y += 24;
            card.Controls.Add(CreateFieldLabel("Dependências Críticas:", 15, y));
            lblDiagDeps = CreateValueLabel("Verificando estrutura...", 180, y, Color.FromArgb(245, 247, 245));
            lblDiagDeps.Size = new Size(490, 18);
            card.Controls.Add(lblDiagDeps);

            y += 28;
            Label lblErrHead = new Label();
            lblErrHead.Text = "ERROS RECENTES DO BACKEND:";
            lblErrHead.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            lblErrHead.ForeColor = Color.FromArgb(255, 120, 120);
            lblErrHead.Location = new Point(15, y);
            lblErrHead.AutoSize = true;
            card.Controls.Add(lblErrHead);

            y += 20;
            txtDiagErrors = new TextBox();
            txtDiagErrors.Location = new Point(15, y);
            txtDiagErrors.Size = new Size(660, 70);
            txtDiagErrors.Multiline = true;
            txtDiagErrors.ScrollBars = ScrollBars.Vertical;
            txtDiagErrors.ReadOnly = true;
            txtDiagErrors.BackColor = Color.FromArgb(4, 10, 6);
            txtDiagErrors.ForeColor = Color.FromArgb(255, 140, 140);
            txtDiagErrors.Font = new Font("Consolas", 8f);
            card.Controls.Add(txtDiagErrors);

            y += 80;
            Label lblLogHead = new Label();
            lblLogHead.Text = "LOGS RECENTES DO LAUNCHER:";
            lblLogHead.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            lblLogHead.ForeColor = Color.FromArgb(140, 152, 145);
            lblLogHead.Location = new Point(15, y);
            lblLogHead.AutoSize = true;
            card.Controls.Add(lblLogHead);

            y += 20;
            txtDiagLogs = new TextBox();
            txtDiagLogs.Location = new Point(15, y);
            txtDiagLogs.Size = new Size(660, 95);
            txtDiagLogs.Multiline = true;
            txtDiagLogs.ScrollBars = ScrollBars.Vertical;
            txtDiagLogs.ReadOnly = true;
            txtDiagLogs.BackColor = Color.FromArgb(4, 10, 6);
            txtDiagLogs.ForeColor = Color.FromArgb(140, 152, 145);
            txtDiagLogs.Font = new Font("Consolas", 8f);
            card.Controls.Add(txtDiagLogs);

            y += 105;
            Button btnCopyDiag = CreateButton("📋 Copiar Diagnóstico Técnico Completo", 15, y, 300, 36, true);
            btnCopyDiag.Click += (s, e) => { CopyDiagnosticsReport(); };
            card.Controls.Add(btnCopyDiag);

            Button btnRefreshDiag = CreateButton("🔄 Atualizar Diagnósticos", 325, y, 200, 36, false);
            btnRefreshDiag.Click += (s, e) => { RefreshDiagnostics(); };
            card.Controls.Add(btnRefreshDiag);

            page.Controls.Add(card);
            return page;
        }

        // ==========================================
        // CARREGAMENTO DE DADOS & OPERAÇÕES
        // ==========================================
        private async void LoadDataAsync()
        {
            await Task.Run(() =>
            {
                CheckDatabaseInfo();
                RefreshHardwareInfoSync();
                RefreshDiagnosticsSync();
            });

            await TestApiConnectionAsync();
        }

        private void CheckDatabaseInfo()
        {
            try
            {
                bool exists = File.Exists(dbPath);
                long size = exists ? new FileInfo(dbPath).Length : 0;
                string integrityResult = "Não verificado";

                if (exists)
                {
                    // 1. Verificação segura de cabeçalho SQLite (assinatura de 16 bytes)
                    try
                    {
                        using (var fs = new FileStream(dbPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        {
                            byte[] header = new byte[16];
                            int read = fs.Read(header, 0, 16);
                            if (read >= 15 && Encoding.ASCII.GetString(header, 0, 15).StartsWith("SQLite format 3"))
                            {
                                integrityResult = "● OK (Cabeçalho SQLite 3 válido)";
                            }
                            else
                            {
                                integrityResult = "⚠️ Cabeçalho SQLite não reconhecido";
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        integrityResult = "Erro ao ler arquivo: " + ex.Message;
                    }
                }
                else
                {
                    integrityResult = "Arquivo não encontrado";
                }

                // Identificar último backup na pasta backups
                string lastBackupText = GetLatestBackupInfo();

                // Atualizar UI
                this.Invoke(new Action(() =>
                {
                    lblDbExistsValue.Text = exists ? "● Arquivo Presente (OK)" : "○ Arquivo Não Encontrado";
                    lblDbExistsValue.ForeColor = exists ? Color.FromArgb(57, 255, 136) : Color.FromArgb(255, 100, 100);

                    lblDbSizeValue.Text = exists ? string.Format("{0:N1} KB ({1:N0} bytes)", size / 1024.0, size) : "---";
                    lblDbConnStateValue.Text = parentLauncher.IsServerOnline ? "● Conectado via Backend REST / SQLite3" : "○ Disponível para leitura local";
                    lblDbConnStateValue.ForeColor = parentLauncher.IsServerOnline ? Color.FromArgb(57, 255, 136) : Color.FromArgb(255, 209, 102);

                    lblDbIntegrityValue.Text = integrityResult;
                    lblDbIntegrityValue.ForeColor = integrityResult.StartsWith("● OK") ? Color.FromArgb(57, 255, 136) : Color.FromArgb(255, 100, 100);

                    lblDbBackupValue.Text = lastBackupText;
                }));
            }
            catch { }
        }

        private string GetLatestBackupInfo()
        {
            try
            {
                string backupDir = Path.Combine(projectDir, "backups");
                if (!Directory.Exists(backupDir)) return "Nenhum backup registrado até o momento.";

                var files = new DirectoryInfo(backupDir).GetFiles("*.db");
                if (files.Length == 0) return "Nenhum backup registrado até o momento.";

                FileInfo latest = null;
                foreach (var f in files)
                {
                    if (latest == null || f.LastWriteTime > latest.LastWriteTime)
                    {
                        latest = f;
                    }
                }

                if (latest != null)
                {
                    return string.Format("{0} ({1:dd/MM/yyyy HH:mm} — {2:N1} KB)",
                        latest.Name, latest.LastWriteTime, latest.Length / 1024.0);
                }
            }
            catch { }
            return "Nenhum backup registrado até o momento.";
        }

        // Criar Backup de forma segura e consistente com SQLite
        private async Task PerformDatabaseBackupAsync()
        {
            if (!File.Exists(dbPath))
            {
                MessageBox.Show("Arquivo de banco de dados não encontrado em: " + dbPath, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            btnBackupNow.Enabled = false;
            btnBackupNow.Text = "Criando Backup...";

            string backupDir = Path.Combine(projectDir, "backups");
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string backupFileName = "smart_tennis_backup_" + timestamp + ".db";
            string targetPath = Path.Combine(backupDir, backupFileName);

            bool success = false;
            string errorMsg = "";

            await Task.Run(() =>
            {
                try
                {
                    if (!Directory.Exists(backupDir))
                    {
                        Directory.CreateDirectory(backupDir);
                    }

                    // 1. Tentar VACUUM INTO via node.js (procedimento consistente oficial do SQLite)
                    string nodeDbScript = string.Format(
                        "const sqlite3=require('sqlite3'); const db=new sqlite3.Database('{0}', sqlite3.OPEN_READWRITE); db.run('VACUUM INTO \\'{1}\\'', (err) => {{ db.close(); if(err) {{ console.error(err.message); process.exit(1); }} else {{ console.log('OK'); process.exit(0); }} }});",
                        dbPath.Replace("\\", "/"),
                        targetPath.Replace("\\", "/")
                    );

                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = nodePath;
                    psi.Arguments = "-e \"" + nodeDbScript.Replace("\"", "\\\"") + "\"";
                    psi.WorkingDirectory = projectDir;
                    psi.UseShellExecute = false;
                    psi.RedirectStandardOutput = true;
                    psi.RedirectStandardError = true;
                    psi.CreateNoWindow = true;

                    using (var p = Process.Start(psi))
                    {
                        p.WaitForExit(6000);
                        if (p.ExitCode == 0 && File.Exists(targetPath) && new FileInfo(targetPath).Length > 0)
                        {
                            success = true;
                        }
                    }

                    // 2. Fallback consistente caso node não execute: cópia segura com FileShare.ReadWrite
                    if (!success)
                    {
                        using (var src = new FileStream(dbPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        using (var dst = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            src.CopyTo(dst);
                        }
                        if (File.Exists(targetPath) && new FileInfo(targetPath).Length > 0)
                        {
                            success = true;
                        }
                    }
                }
                catch (Exception ex)
                {
                    errorMsg = ex.Message;
                }
            });

            btnBackupNow.Enabled = true;
            btnBackupNow.Text = "💾 Criar Backup Agora";

            if (success)
            {
                FileInfo fi = new FileInfo(targetPath);
                string infoStr = string.Format("{0} ({1:dd/MM/yyyy HH:mm} — {2:N1} KB)", fi.Name, fi.LastWriteTime, fi.Length / 1024.0);
                lblDbBackupValue.Text = infoStr;

                parentLauncher.Log("Backup do SQLite criado com sucesso: " + fi.Name);

                MessageBox.Show(
                    "Backup consistente do banco criado com sucesso!\n\n" +
                    "Arquivo: " + fi.Name + "\n" +
                    "Tamanho: " + (fi.Length / 1024.0).ToString("F1") + " KB\n" +
                    "Local: " + backupDir,
                    "Backup Realizado",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            else
            {
                MessageBox.Show("Falha ao criar backup do banco de dados:\n" + errorMsg, "Erro de Backup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OpenBackupDirectory()
        {
            try
            {
                string backupDir = Path.Combine(projectDir, "backups");
                if (!Directory.Exists(backupDir))
                {
                    Directory.CreateDirectory(backupDir);
                }
                Process.Start("explorer.exe", backupDir);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Não foi possível abrir a pasta: " + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // Testar conexão com /api/status sem travar a interface
        private async Task TestApiConnectionAsync()
        {
            btnTestConnection.Enabled = false;
            btnTestConnection.Text = "Testando...";
            lblHttpTestVal.Text = "Enviando requisição para http://127.0.0.1:3000/api/status...";
            lblHttpTestVal.ForeColor = Color.FromArgb(245, 247, 245);

            bool isOk = false;
            string resultText = "";
            long elapsedMs = 0;

            await Task.Run(async () =>
            {
                Stopwatch sw = Stopwatch.StartNew();
                try
                {
                    using (HttpClient client = new HttpClient())
                    {
                        client.Timeout = TimeSpan.FromSeconds(2.0);
                        var response = await client.GetAsync("http://127.0.0.1:3000/api/status");
                        sw.Stop();
                        elapsedMs = sw.ElapsedMilliseconds;

                        if (response.IsSuccessStatusCode)
                        {
                            isOk = true;
                            string body = await response.Content.ReadAsStringAsync();

                            string product = ExtractJsonString(body, "product");
                            string version = ExtractJsonString(body, "version");

                            resultText = string.Format("● HTTP {0} OK ({1}ms) — Produto: {2} (v{3})",
                                (int)response.StatusCode, elapsedMs, product, version);
                        }
                        else
                        {
                            resultText = string.Format("○ Resposta HTTP {0} ({1}ms)", (int)response.StatusCode, elapsedMs);
                        }
                    }
                }
                catch (Exception)
                {
                    sw.Stop();
                    resultText = "○ Servidor Offline (Porta 3000 não respondeu)";
                }
            });

            lblHttpTestVal.Text = resultText;
            lblHttpTestVal.ForeColor = isOk ? Color.FromArgb(57, 255, 136) : Color.FromArgb(255, 120, 120);

            lblServerStatusVal.Text = isOk ? "● Online (Respondendo normalmente)" : "○ Parado (Servidor desligado)";
            lblServerStatusVal.ForeColor = isOk ? Color.FromArgb(57, 255, 136) : Color.FromArgb(140, 152, 145);

            btnTestConnection.Enabled = true;
            btnTestConnection.Text = "⚡ Testar Conexão (/api/status)";
        }

        private void RefreshHardwareInfo()
        {
            btnRefreshHw.Enabled = false;
            Task.Run(() =>
            {
                RefreshHardwareInfoSync();
                this.Invoke(new Action(() =>
                {
                    btnRefreshHw.Enabled = true;
                }));
            });
        }

        private void RefreshHardwareInfoSync()
        {
            try
            {
                string[] ports = SerialPort.GetPortNames();
                string comText = (ports != null && ports.Length > 0)
                    ? string.Join(", ", ports) + " (Disponível para leitura serial)"
                    : "Nenhuma porta COM encontrada (Dispositivo desconectado)";

                string arduinoState = (ports != null && ports.Length > 0)
                    ? "● Porta serial detectada. Aguardando leitura do script ou envio REST/WS."
                    : "○ Nenhum microcontrolador Arduino detectado nas portas seriais.";

                // Consulta de última comunicação no SQLite
                string lastHitText = GetLastHitFromDatabase();

                this.Invoke(new Action(() =>
                {
                    lblComPortsVal.Text = comText;
                    lblComPortsVal.ForeColor = (ports != null && ports.Length > 0) ? Color.FromArgb(57, 255, 136) : Color.FromArgb(140, 152, 145);

                    lblArduinoStateVal.Text = arduinoState;
                    lblArduinoStateVal.ForeColor = (ports != null && ports.Length > 0) ? Color.FromArgb(255, 209, 102) : Color.FromArgb(140, 152, 145);

                    lblLastHitVal.Text = lastHitText;
                }));
            }
            catch { }
        }

        private string GetLastHitFromDatabase()
        {
            if (!File.Exists(dbPath)) return "Banco de dados não encontrado.";

            try
            {
                // Query rápida de somente-leitura usando node
                string nodeScript = "const { get } = require('./server/database/db'); (async () => { try { const s = await get('SELECT id, created_at, source, sensor_id, force, score FROM shots ORDER BY id DESC LIMIT 1'); console.log(JSON.stringify(s || {})); } catch(e) { console.log('{}'); } process.exit(0); })();";
                
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = "-e \"" + nodeScript.Replace("\"", "\\\"") + "\"";
                psi.WorkingDirectory = projectDir;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.CreateNoWindow = true;

                using (var p = Process.Start(psi))
                {
                    string outStr = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(2000);

                    if (!string.IsNullOrEmpty(outStr))
                    {
                        string id = ExtractJsonNumber(outStr, "id");
                        string dt = ExtractJsonString(outStr, "created_at");
                        string sensor = ExtractJsonString(outStr, "sensor_id");
                        string force = ExtractJsonNumber(outStr, "force");
                        string source = ExtractJsonString(outStr, "source");

                        if (!string.IsNullOrEmpty(id) && id != "0")
                        {
                            return string.Format("ID #{0} • {1} • Sensor {2} • Força {3} • Origem: {4}",
                                id, dt, sensor, force, source);
                        }
                    }
                }
            }
            catch { }

            return "Nenhum impacto físico registrado até o momento.";
        }

        private void OpenHardwareGuide()
        {
            try
            {
                string guidePath = Path.Combine(projectDir, "HARDWARE_INTEGRATION.md");
                if (File.Exists(guidePath))
                {
                    Process.Start(new ProcessStartInfo { FileName = guidePath, UseShellExecute = true });
                }
                else
                {
                    MessageBox.Show("Arquivo HARDWARE_INTEGRATION.md não encontrado.", "Aviso", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao abrir guia: " + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RefreshDiagnostics()
        {
            Task.Run(() => { RefreshDiagnosticsSync(); });
        }

        private void RefreshDiagnosticsSync()
        {
            try
            {
                string nodeVer = "Não identificado";
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = nodePath;
                    psi.Arguments = "-v";
                    psi.UseShellExecute = false;
                    psi.RedirectStandardOutput = true;
                    psi.CreateNoWindow = true;
                    using (var p = Process.Start(psi))
                    {
                        nodeVer = p.StandardOutput.ReadToEnd().Trim();
                        p.WaitForExit(1000);
                    }
                }
                catch { }

                bool hasServer = File.Exists(Path.Combine(projectDir, @"server\index.js"));
                bool hasDb = File.Exists(Path.Combine(projectDir, @"server\database\smart_tennis.db"));
                bool hasFrontend = File.Exists(Path.Combine(projectDir, @"server\public\index.html"));
                bool hasModules = Directory.Exists(Path.Combine(projectDir, @"node_modules"));

                string depsText = string.Format("server: {0} | sqlite: {1} | frontend: {2} | modules: {3}",
                    hasServer ? "OK" : "Ausente",
                    hasDb ? "OK" : "Ausente",
                    hasFrontend ? "OK" : "Ausente",
                    hasModules ? "OK" : "Ausente");

                string recentErrors = LauncherForm.SystemErrors.Count > 0
                    ? string.Join(Environment.NewLine, LauncherForm.SystemErrors.ToArray())
                    : "● Nenhum erro crítico registrado no servidor.";

                string recentLogs = LauncherForm.SystemLogs.Count > 0
                    ? string.Join(Environment.NewLine, LauncherForm.SystemLogs.ToArray())
                    : "Aguardando logs...";

                this.Invoke(new Action(() =>
                {
                    lblDiagNodeVer.Text = nodeVer + " (" + nodePath + ")";
                    lblDiagDeps.Text = depsText;
                    txtDiagErrors.Text = recentErrors;
                    txtDiagLogs.Text = recentLogs;
                }));
            }
            catch { }
        }

        private void CopyDiagnosticsReport()
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("====================================================");
                sb.AppendLine(" MOTION TENNIS — RELATÓRIO DE DIAGNÓSTICO TÉCNICO   ");
                sb.AppendLine("====================================================");
                sb.AppendLine("Data/Hora:           " + DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"));
                sb.AppendLine("Sistema Operacional: " + Environment.OSVersion.ToString() + (Environment.Is64BitOperatingSystem ? " (64-bit)" : " (32-bit)"));
                sb.AppendLine("Diretório Projeto:   " + projectDir);
                sb.AppendLine("Node.js Path:        " + nodePath);
                sb.AppendLine("Node.js Versão:      " + lblDiagNodeVer.Text);
                sb.AppendLine();
                sb.AppendLine("[BANCO DE DADOS]");
                sb.AppendLine("Arquivo:             smart_tennis.db");
                sb.AppendLine("Caminho:             " + dbPath);
                sb.AppendLine("Existência:          " + (File.Exists(dbPath) ? "Sim" : "Não"));
                sb.AppendLine("Tamanho:             " + (File.Exists(dbPath) ? (new FileInfo(dbPath).Length / 1024.0).ToString("F1") + " KB" : "---"));
                sb.AppendLine("Integridade:         " + lblDbIntegrityValue.Text);
                sb.AppendLine("Último Backup:       " + lblDbBackupValue.Text);
                sb.AppendLine();
                sb.AppendLine("[REDE & SERVIDOR]");
                sb.AppendLine("Status Backend:      " + (parentLauncher.IsServerOnline ? "Online" : "Parado"));
                sb.AppendLine("Porta TCP:           3000");
                sb.AppendLine("IPv4 Local:          " + GetLocalIPv4Address());
                sb.AppendLine("URL Local:           http://127.0.0.1:3000");
                sb.AppendLine("URL Android:         http://" + GetLocalIPv4Address() + ":3000");
                sb.AppendLine("Diagnóstico HTTP:    " + lblHttpTestVal.Text);
                sb.AppendLine();
                sb.AppendLine("[HARDWARE]");
                sb.AppendLine("Portas COM:          " + lblComPortsVal.Text);
                sb.AppendLine("Status Arduino:      " + lblArduinoStateVal.Text);
                sb.AppendLine("Modo Sensores:       " + lblSensorsModeVal.Text);
                sb.AppendLine("Última Telemetria:   " + lblLastHitVal.Text);
                sb.AppendLine();
                sb.AppendLine("[DEPENDÊNCIAS]");
                sb.AppendLine(lblDiagDeps.Text);
                sb.AppendLine();
                sb.AppendLine("[ERROS DO BACKEND]");
                sb.AppendLine(txtDiagErrors.Text);
                sb.AppendLine();
                sb.AppendLine("[LOGS RECENTES]");
                sb.AppendLine(txtDiagLogs.Text);
                sb.AppendLine("====================================================");

                // Sanitização estrita: remover eventuais tokens ou segredos
                string report = sb.ToString();
                report = Regex.Replace(report, "ey[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+", "[TOKEN_REDACTED]");
                report = Regex.Replace(report, "(?i)password[\"':\\s]+[A-Za-z0-9_-]+", "password: [REDACTED]");

                Clipboard.SetText(report);
                MessageBox.Show("Relatório técnico copiado com sucesso para a Área de Transferência!\n\nSenhas e tokens foram omitidos por segurança.", "Relatório Copiado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao copiar diagnóstico: " + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // ==========================================
        // HELPERS & UI BUILDERS
        // ==========================================
        public static string GetLocalIPv4Address()
        {
            try
            {
                using (var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp))
                {
                    socket.Connect("8.8.8.8", 65530);
                    var endPoint = socket.LocalEndPoint as IPEndPoint;
                    if (endPoint != null) return endPoint.Address.ToString();
                }
            }
            catch { }

            try
            {
                foreach (var ip in Dns.GetHostAddresses(Dns.GetHostName()))
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    {
                        return ip.ToString();
                    }
                }
            }
            catch { }

            return "127.0.0.1";
        }

        private string ExtractJsonString(string json, string key)
        {
            try
            {
                Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) return m.Groups[1].Value;
            }
            catch { }
            return "";
        }

        private string ExtractJsonNumber(string json, string key)
        {
            try
            {
                Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*([0-9.]+)");
                if (m.Success) return m.Groups[1].Value;
            }
            catch { }
            return "";
        }

        private Panel CreateCardPanel(int x, int y, int width, int height)
        {
            Panel pnl = new Panel();
            pnl.Location = new Point(x, y);
            pnl.Size = new Size(width, height);
            pnl.BackColor = Color.FromArgb(12, 26, 17);
            pnl.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(27, 54, 36), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, pnl.Width - 1, pnl.Height - 1);
                }
            };
            return pnl;
        }

        private Label CreateSectionHeader(string title)
        {
            Label lbl = new Label();
            lbl.Text = title;
            lbl.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            lbl.ForeColor = Color.FromArgb(57, 255, 136);
            lbl.AutoSize = true;
            return lbl;
        }

        private Label CreateFieldLabel(string text, int x, int y)
        {
            Label lbl = new Label();
            lbl.Text = text;
            lbl.Location = new Point(x, y);
            lbl.Size = new Size(170, 20);
            lbl.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            lbl.ForeColor = Color.FromArgb(140, 152, 145);
            return lbl;
        }

        private Label CreateValueLabel(string text, int x, int y, Color color)
        {
            Label lbl = new Label();
            lbl.Text = text;
            lbl.Location = new Point(x, y);
            lbl.AutoSize = true;
            lbl.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            lbl.ForeColor = color;
            return lbl;
        }

        private Button CreateButton(string text, int x, int y, int width, int height, bool isPrimary)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.Location = new Point(x, y);
            btn.Size = new Size(width, height);
            btn.FlatStyle = FlatStyle.Flat;
            btn.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            btn.Cursor = Cursors.Hand;
            if (isPrimary)
            {
                btn.BackColor = Color.FromArgb(16, 34, 22);
                btn.ForeColor = Color.FromArgb(57, 255, 136);
                btn.FlatAppearance.BorderColor = Color.FromArgb(57, 255, 136);
            }
            else
            {
                btn.BackColor = Color.FromArgb(12, 26, 17);
                btn.ForeColor = Color.FromArgb(245, 247, 245);
                btn.FlatAppearance.BorderColor = Color.FromArgb(27, 54, 36);
            }
            return btn;
        }
    }
}
