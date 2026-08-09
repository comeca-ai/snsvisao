# Operação do Fio — guia para quem não é dev

Este guia mostra, passo a passo, como colocar o **Fio** (seu agente
comercial de WhatsApp) no ar numa VPS própria e como operá-lo no dia a dia.
Não é preciso saber programar: é só copiar e colar os comandos.

---

## 1. Criando a VPS

1. Crie uma conta num provedor de VPS (Hetzner, DigitalOcean, Vultr, AWS
   Lightsail etc.).
2. Crie um servidor com:
   - **Sistema operacional: Ubuntu 24.04** (exatamente esta versão);
   - **Mínimo 2 GB de RAM** e 1 vCPU (2 GB é o piso; 4 GB dá folga);
   - 20 GB de disco ou mais.
3. Anote o **endereço IP** do servidor e a senha/chave de acesso root.

Conecte-se ao servidor a partir do seu computador:

```bash
ssh root@IP_DA_SUA_VPS
```

## 2. Subindo a stack (instalação)

Ainda conectado na VPS, rode:

```bash
# Baixa o código do Fio
apt-get update && apt-get install -y git
git clone URL_DO_REPOSITORIO /root/fio-repo
cd /root/fio-repo

# Instala tudo: Docker, banco de dados, Evolution API e o agente
bash scripts/setup-vps.sh
```

O script vai:

- instalar o Docker;
- copiar o projeto para `/opt/fio`;
- gerar senhas e tokens de segurança aleatórios no arquivo `/opt/fio/.env`;
- **perguntar qual provedor de IA você vai usar** (Anthropic, Kimi ou
  OpenAI) e a chave de API correspondente — tenha a chave em mãos;
- subir todos os serviços e deixar tudo pronto para conectar o WhatsApp.

Ao final, ele imprime as instruções para o próximo passo. Rodar o script
duas vezes não estraga nada — ele reaproveita o que já existe.

## 3. Conectando o número de WhatsApp (QR code)

Use um **número dedicado** para o Fio (um chip só para o negócio — veja a
seção de segurança abaixo).

Na VPS, rode:

```bash
cd /opt/fio
bash scripts/show-qrcode.sh
```

O script mostra o QR code. Então, **no celular do número dedicado**:

1. Abra o **WhatsApp**;
2. Vá em **Aparelhos conectados** (Android: menu ⋮; iPhone: Ajustes);
3. Toque em **Conectar aparelho**;
4. Aponte a câmera para o QR code da tela.

Se o QR não aparecer bonito no terminal, o script salva uma imagem em
`/tmp/fio-qrcode.png` e ensina como trazê-la para o seu computador
(comando `scp`) ou visualizá-la pelo navegador com redirecionamento SSH.

Pronto: a partir daí, toda mensagem que chegar nesse número será
respondida pelo Fio.

## 4. Dia a dia: logs e status

```bash
cd /opt/fio

docker compose ps                 # tudo rodando? (3 serviços "healthy")
docker compose logs -f server     # acompanhar o agente em tempo real (Ctrl+C sai)
docker compose logs -f evolution  # logs da conexão WhatsApp
docker compose restart server     # reiniciar só o agente
docker compose up -d --build      # aplicar uma atualização de código
bash scripts/show-qrcode.sh       # ver se o número continua conectado
```

## 5. Trocando o provedor de IA (LLM)

O Fio funciona com três provedores: **Anthropic** (Claude), **Kimi**
(Moonshot) e **OpenAI** (ChatGPT). Para trocar:

1. Edite o arquivo de configuração:

   ```bash
   nano /opt/fio/.env
   ```

2. Ajuste três linhas, por exemplo para usar a OpenAI:

   ```
   LLM_PROVIDER=openai
   LLM_MODEL=gpt-4o
   LLM_API_KEY=sua-chave-da-openai
   ```

   (Para Anthropic: `anthropic` / `claude-opus-4-5`. Para Kimi:
   `kimi` / `kimi-k2`.)

3. Salve (no `nano`: `Ctrl+O`, Enter, `Ctrl+X`) e reinicie o agente:

   ```bash
   cd /opt/fio && docker compose up -d --force-recreate server
   ```

Nada mais precisa mudar — conversas, contatos e o WhatsApp continuam
funcionando como estavam.

## 6. Migração futura para a Cloud API oficial do WhatsApp

Hoje o Fio usa a **Evolution API** (conexão via QR code, como o WhatsApp
Web). No futuro, se o volume crescer, o plano é homologar a **Cloud API
oficial da Meta**.

Para você, operador, o que importa:

- **A mudança é só do "mensageiro"**. Todo o resto — banco de dados,
  memória dos clientes, agente, IA — continua exatamente igual.
- Tecnicamente, será trocado apenas o componente de envio/recebimento
  (o "provider" de mensageria), sem mexer nas regras de negócio.
- As conversas e os contatos já registrados são preservados.

Ou seja: começar pela Evolution API agora não gera retrabalho depois.

## 7. Segurança e anti-banimento (leia com atenção)

A conexão via QR code não é oficialmente homologada pela Meta. Usada com
bom senso, funciona bem — mas siga estas regras para não perder o número:

- **Número dedicado**: use um chip exclusivo para o Fio. Não use o seu
  número pessoal nem o principal da empresa.
- **Nada de disparo em massa**: o Fio responde quem fala com ele. Nunca
  use esse número para listas de transmissão, spam ou mensagens frias em
  volume — é a causa nº 1 de banimento.
- **Aqueça o número**: nos primeiros dias, use o WhatsApp desse número
  normalmente (troque mensagens com pessoas reais, entre em um grupo ou
  dois, complete o perfil com nome e foto da empresa). Números novos que
  só respondem automaticamente chamam atenção.
- **Ritmo humano**: o Fio já tem um intervalo mínimo entre respostas
  (`SEND_MIN_INTERVAL_MS`, padrão 1,2 s). Não diminua esse valor.
- **Celular ligado**: mantenha o aparelho do número dedicado carregado e
  com internet de tempos em tempos; o WhatsApp exige que o aparelho
  principal "dê sinal de vida" periodicamente.
- **Backup das senhas**: o arquivo `/opt/fio/.env` contém todas as senhas
  e tokens. Guarde uma cópia dele em local seguro (e fora da VPS).
- Se o número cair, rode `bash scripts/show-qrcode.sh` e escaneie o QR de
  novo.

## 8. Onde cada coisa mora

| O quê | Onde |
|---|---|
| Configuração e segredos | `/opt/fio/.env` |
| Código do projeto | `/opt/fio` |
| Dados do Postgres (conversas, contatos) | volume Docker `pgdata` |
| Logs | `docker compose logs` (rodando de `/opt/fio`) |
| QR code temporário | `/tmp/fio-qrcode.png` |

## 9. Canal web (chat do Fio no navegador)

Além do WhatsApp, o Fio atende o visitante direto no navegador: é o serviço
`web` do compose (interface em português, sem precisar criar conta).

- **Como acessar**: `http://IP_DA_SUA_VPS:3001` (o compose publica
  `3001:3000`). Se tiver domínio próprio, aponte para essa porta.
- **Como funciona**: a interface web não fala com nenhum provedor de IA. Ela
  repassa cada mensagem para o cérebro do Fio (`server` Express) no endpoint
  `POST /webchat/message` — mesma persona, mesma memória, mesmas regras de
  consentimento (LGPD) do WhatsApp.
- **Variáveis novas** (ficam no `/opt/fio/.env`):
  - `AUTH_SECRET` — segredo das sessões do visitante. Gere uma vez com
    `openssl rand -base64 32` e cole no `.env`.
  - `FIO_WEBHOOK_TOKEN` — copie o mesmo valor de `WEBHOOK_TOKEN`.
  - `FIO_SERVER_URL` — já vem certo no compose (`http://server:3000`).
  - `POSTGRES_URL` do web — o compose monta sozinho a partir de
    `POSTGRES_PASSWORD`; não precisa preencher.
- **Onde ficam as conversas do site**: no database `fio_web` do mesmo
  Postgres (criado automaticamente no primeiro boot pelo script
  `db/init/00-create-dbs.sh`). As tabelas são aplicadas no boot do
  container web (migrations do drizzle, idempotentes).
- **Logs**: `docker compose logs web` (rodando de `/opt/fio`).
