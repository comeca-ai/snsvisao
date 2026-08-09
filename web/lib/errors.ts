export type ErrorType =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "offline";

export type Surface =
  | "chat"
  | "auth"
  | "api"
  | "stream"
  | "database"
  | "history"
  | "vote"
  | "document"
  | "suggestions";

export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = "response" | "log" | "none";

export const visibilityBySurface: Record<Surface, ErrorVisibility> = {
  api: "response",
  auth: "response",
  chat: "response",
  database: "log",
  document: "response",
  history: "response",
  stream: "response",
  suggestions: "response",
  vote: "response",
};

export class ChatbotError extends Error {
  type: ErrorType;
  surface: Surface;
  statusCode: number;

  constructor(errorCode: ErrorCode, cause?: string | ErrorOptions) {
    const message = getMessageByErrorCode(errorCode);
    const options = typeof cause === "string" ? undefined : cause;

    super(message, options);

    const [type, surface] = errorCode.split(":");

    this.type = type as ErrorType;
    if (typeof cause === "string") {
      this.cause = cause;
    }
    this.surface = surface as Surface;
    this.statusCode = getStatusCodeByType(this.type);
  }

  toResponse() {
    const code: ErrorCode = `${this.type}:${this.surface}`;
    const visibility = visibilityBySurface[this.surface];

    const { message, cause, statusCode } = this;

    if (visibility === "log") {
      console.error({
        cause,
        code,
        message,
      });

      return Response.json(
        {
          code: "",
          message: "Algo deu errado por aqui. Tenta de novo daqui a pouco.",
        },
        { status: statusCode }
      );
    }

    return Response.json({ cause, code, message }, { status: statusCode });
  }
}

export function getMessageByErrorCode(errorCode: ErrorCode): string {
  if (errorCode.includes("database")) {
    return "Tivemos um problema ao acessar os dados. Tenta de novo?";
  }

  switch (errorCode) {
    case "bad_request:api":
      return "Não consegui entender esse pedido. Confere e tenta de novo?";

    case "unauthorized:auth":
      return "Precisamos te identificar antes de continuar.";
    case "forbidden:auth":
      return "Sua conta não tem acesso a este recurso.";

    case "rate_limit:chat":
      return "Você já mandou muitas mensagens por agora. Volta daqui a 1 hora para continuar.";
    case "not_found:chat":
      return "Não encontrei essa conversa. Confere o link e tenta de novo?";
    case "forbidden:chat":
      return "Essa conversa pertence a outra pessoa.";
    case "unauthorized:chat":
      return "Você precisa estar conectado para ver essa conversa.";
    case "offline:chat":
      return "Opa, o Fio deu uma escorregada por aqui. Tenta de novo?";

    case "not_found:document":
      return "Não encontrei esse documento.";
    case "forbidden:document":
      return "Esse documento pertence a outra pessoa.";
    case "unauthorized:document":
      return "Você precisa estar conectado para ver esse documento.";
    case "bad_request:document":
      return "O pedido de criar ou atualizar o documento é inválido.";

    default:
      return "Algo deu errado por aqui. Tenta de novo daqui a pouco.";
  }
}

function getStatusCodeByType(type: ErrorType) {
  switch (type) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "rate_limit":
      return 429;
    case "offline":
      return 503;
    default:
      return 500;
  }
}
