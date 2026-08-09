// O canal web tem um único "cérebro": o Fio (server Express via
// /webchat/message). Não há seleção de modelo de IA — esta constante existe
// apenas para manter o contrato do useChat do template.
export const DEFAULT_CHAT_MODEL = "fio";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    description: "Parceiro comercial que não perde o fio da conversa",
    id: DEFAULT_CHAT_MODEL,
    name: "Fio",
    provider: "fio",
  },
];
