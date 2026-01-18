import crypto from "crypto"

// ============================================
// TrexPay API Integration
// Documentação: https://app.trexpay.com.br
// ============================================

const TREXPAY_BASE_URL = "https://app.trexpay.com.br"

// Tipos para requisições e respostas
export interface TrexPayDepositRequest {
  token: string
  secret: string
  postback: string
  amount: number
  debtor_name: string
  email: string
  debtor_document_number: string
  phone: string
  method_pay: "pix"
  src?: string
  sck?: string
  utm_source?: string
  utm_campaign?: string
  utm_medium?: string
  utm_content?: string
  utm_term?: string
  split_email?: string
  split_percentage?: string
}

export interface TrexPayDepositResponse {
  success: boolean
  idTransaction?: string
  qrCode?: string
  qrCodeBase64?: string
  pixKey?: string
  expiresAt?: string
  error?: string
  message?: string
}

export interface TrexPayStatusRequest {
  idTransaction: string
}

export interface TrexPayStatusResponse {
  success: boolean
  idTransaction: string
  status: "pending" | "paid" | "expired" | "cancelled"
  amount?: number
  paid_at?: string
  error?: string
}

export interface TrexPayWebhookPayload {
  event: "pix.received" | "pix.sent"
  data: {
    idTransaction: string
    status: string
    amount: number
    paid_at?: string
    completed_at?: string
    typeTransaction: string
    payer?: {
      name: string
      document: string
    }
    pixKey?: string
    pixKeyType?: string
    metadata: {
      endToEndId: string
      txid: string
    }
  }
  signature: string
}

// ============================================
// Funções de utilidade
// ============================================

/**
 * Verifica a assinatura do webhook da TrexPay
 */
export function verifyWebhookSignature(
  payload: object,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex")

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (error) {
    console.error("[TrexPay] Erro ao verificar assinatura:", error)
    return false
  }
}

/**
 * Formata CPF removendo caracteres especiais
 */
function formatDocument(document: string): string {
  return document.replace(/\D/g, "")
}

/**
 * Formata telefone para o padrão internacional
 */
function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.startsWith("55")) {
    return `+${cleaned}`
  }
  return `+55${cleaned}`
}

// ============================================
// Funções principais da API
// ============================================

/**
 * Cria um depósito PIX na TrexPay
 */
export async function createPixDeposit(params: {
  amount: number
  customerName: string
  customerEmail: string
  customerDocument: string
  customerPhone: string
  postbackUrl: string
  trackingParams?: {
    src?: string
    sck?: string
    utm_source?: string
    utm_campaign?: string
    utm_medium?: string
    utm_content?: string
    utm_term?: string
  }
}): Promise<TrexPayDepositResponse> {
  const token = process.env.TREXPAY_TOKEN
  const secret = process.env.TREXPAY_SECRET

  if (!token || !secret) {
    console.error("[TrexPay] Credenciais não configuradas")
    return {
      success: false,
      error: "INVALID_CREDENTIALS",
      message: "Credenciais da TrexPay não configuradas",
    }
  }

  const requestBody: TrexPayDepositRequest = {
    token,
    secret,
    postback: params.postbackUrl,
    amount: params.amount,
    debtor_name: params.customerName,
    email: params.customerEmail,
    debtor_document_number: formatDocument(params.customerDocument),
    phone: formatPhone(params.customerPhone),
    method_pay: "pix",
    src: params.trackingParams?.src,
    sck: params.trackingParams?.sck,
    utm_source: params.trackingParams?.utm_source,
    utm_campaign: params.trackingParams?.utm_campaign,
    utm_medium: params.trackingParams?.utm_medium,
    utm_content: params.trackingParams?.utm_content,
    utm_term: params.trackingParams?.utm_term,
  }

  // Remove campos undefined
  Object.keys(requestBody).forEach((key) => {
    if (requestBody[key as keyof TrexPayDepositRequest] === undefined) {
      delete requestBody[key as keyof TrexPayDepositRequest]
    }
  })

  console.log("[TrexPay] Criando depósito PIX:", {
    amount: params.amount,
    customer: params.customerName,
    postback: params.postbackUrl,
  })

  try {
    const response = await fetch(
      `${TREXPAY_BASE_URL}/api/wallet/deposit/payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error("[TrexPay] Erro na resposta:", response.status, data)
      return {
        success: false,
        error: data.error || "API_ERROR",
        message: data.message || `Erro HTTP ${response.status}`,
      }
    }

    console.log("[TrexPay] Depósito criado com sucesso:", data.idTransaction)

    return {
      success: true,
      idTransaction: data.idTransaction,
      qrCode: data.qrCode,
      qrCodeBase64: data.qrCodeBase64,
      pixKey: data.pixKey,
      expiresAt: data.expiresAt,
    }
  } catch (error) {
    console.error("[TrexPay] Erro ao criar depósito:", error)
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: "Erro de conexão com a TrexPay",
    }
  }
}

/**
 * Consulta o status de um depósito PIX
 */
export async function getPixStatus(
  idTransaction: string
): Promise<TrexPayStatusResponse> {
  console.log("[TrexPay] Consultando status da transação:", idTransaction)

  try {
    const response = await fetch(`${TREXPAY_BASE_URL}/api/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ idTransaction }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("[TrexPay] Erro ao consultar status:", response.status, data)
      return {
        success: false,
        idTransaction,
        status: "pending",
        error: data.error || "API_ERROR",
      }
    }

    console.log("[TrexPay] Status:", data.status)

    return {
      success: true,
      idTransaction,
      status: data.status,
      amount: data.amount,
      paid_at: data.paid_at,
    }
  } catch (error) {
    console.error("[TrexPay] Erro ao consultar status:", error)
    return {
      success: false,
      idTransaction,
      status: "pending",
      error: "NETWORK_ERROR",
    }
  }
}

/**
 * Processa webhook de depósito PIX (PIX IN)
 */
export function processPixInWebhook(payload: TrexPayWebhookPayload): {
  transactionId: string
  status: string
  amount: number
  paidAt?: string
  payerName?: string
  payerDocument?: string
} {
  return {
    transactionId: payload.data.idTransaction,
    status: payload.data.status,
    amount: payload.data.amount,
    paidAt: payload.data.paid_at,
    payerName: payload.data.payer?.name,
    payerDocument: payload.data.payer?.document,
  }
}

/**
 * Processa webhook de saque PIX (PIX OUT)
 */
export function processPixOutWebhook(payload: TrexPayWebhookPayload): {
  transactionId: string
  status: string
  amount: number
  completedAt?: string
  pixKey?: string
} {
  return {
    transactionId: payload.data.idTransaction,
    status: payload.data.status,
    amount: payload.data.amount,
    completedAt: payload.data.completed_at,
    pixKey: payload.data.pixKey,
  }
}

// Exporta tipos úteis
export type { TrexPayWebhookPayload }
