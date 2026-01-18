import { type NextRequest, NextResponse } from "next/server"
import { createPixDeposit } from "@/lib/trexpay"
import {
  sendOrderToUtmfy,
  formatUtmfyDate,
  type UtmfyOrderRequest,
} from "@/lib/utmfy"
import { saveUtmParams } from "@/lib/server-utm-store"

// Gera ID único para o pedido
function generateOrderId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PED-${timestamp}-${random}`
}

// Converte valor em reais para centavos
function toCents(value: number): number {
  return Math.round(value * 100)
}

// Obtém URL base para webhooks
function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  return "http://localhost:3000"
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[PIX Create] Recebendo requisição:", JSON.stringify(body))

    const { customer, address, items, total, shipping, trackingParams } = body

    // Validações básicas
    if (
      !customer ||
      !customer.name ||
      !customer.email ||
      !customer.cpf ||
      !customer.phone
    ) {
      return NextResponse.json(
        { error: "Dados do cliente incompletos" },
        { status: 400 }
      )
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Nenhum item no pedido" },
        { status: 400 }
      )
    }

    if (!total || total <= 0) {
      return NextResponse.json(
        { error: "Valor total inválido" },
        { status: 400 }
      )
    }

    const orderId = generateOrderId()
    const amountInCents = toCents(total)

    // Salvar UTM params para uso posterior no webhook
    if (trackingParams) {
      saveUtmParams(orderId, {
        src: trackingParams.src || null,
        sck: trackingParams.sck || null,
        utm_source: trackingParams.utm_source || null,
        utm_campaign: trackingParams.utm_campaign || null,
        utm_medium: trackingParams.utm_medium || null,
        utm_content: trackingParams.utm_content || null,
        utm_term: trackingParams.utm_term || null,
      })
      console.log("[PIX Create] UTMs salvos no servidor para orderId:", orderId)
    }

    // Criar depósito PIX na TrexPay
    const baseUrl = getBaseUrl()
    const postbackUrl = `${baseUrl}/api/webhook/trexpay`

    const trexPayResult = await createPixDeposit({
      amount: total,
      customerName: customer.name,
      customerEmail: customer.email,
      customerDocument: customer.cpf,
      customerPhone: customer.phone,
      postbackUrl,
      trackingParams: trackingParams
        ? {
            src: trackingParams.src,
            sck: trackingParams.sck,
            utm_source: trackingParams.utm_source,
            utm_campaign: trackingParams.utm_campaign,
            utm_medium: trackingParams.utm_medium,
            utm_content: trackingParams.utm_content,
            utm_term: trackingParams.utm_term,
          }
        : undefined,
    })

    if (!trexPayResult.success) {
      console.error("[PIX Create] Erro TrexPay:", trexPayResult.error, trexPayResult.message)
      return NextResponse.json(
        { 
          error: trexPayResult.message || "Erro ao gerar PIX",
          details: trexPayResult.error,
          debug: {
            errorCode: trexPayResult.error,
            message: trexPayResult.message
          }
        },
        { status: 500 }
      )
    }

    const transactionId = trexPayResult.idTransaction || orderId

    // Salvar UTMs também com o transactionId da TrexPay
    if (trackingParams && trexPayResult.idTransaction) {
      saveUtmParams(trexPayResult.idTransaction, {
        src: trackingParams.src || null,
        sck: trackingParams.sck || null,
        utm_source: trackingParams.utm_source || null,
        utm_campaign: trackingParams.utm_campaign || null,
        utm_medium: trackingParams.utm_medium || null,
        utm_content: trackingParams.utm_content || null,
        utm_term: trackingParams.utm_term || null,
      })
    }

    // Enviar evento para UTMify (status waiting_payment)
    try {
      const utmfyOrder: UtmfyOrderRequest = {
        orderId: transactionId,
        platform: "papelaria-site",
        paymentMethod: "pix",
        status: "waiting_payment",
        createdAt: formatUtmfyDate(new Date()) || "",
        approvedDate: null,
        refundedAt: null,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone?.replace(/\D/g, "") || null,
          document: customer.cpf?.replace(/\D/g, "") || null,
          country: "BR",
        },
        products: items.map(
          (item: {
            id: string
            name: string
            price: number
            quantity: number
          }) => ({
            id: item.id || "product",
            name: item.name,
            planId: null,
            planName: null,
            quantity: item.quantity,
            priceInCents: toCents(item.price),
          })
        ),
        trackingParameters: {
          src: trackingParams?.src || null,
          sck: trackingParams?.sck || null,
          utm_source: trackingParams?.utm_source || null,
          utm_campaign: trackingParams?.utm_campaign || null,
          utm_medium: trackingParams?.utm_medium || null,
          utm_content: trackingParams?.utm_content || null,
          utm_term: trackingParams?.utm_term || null,
        },
        commission: {
          totalPriceInCents: amountInCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: amountInCents,
          currency: "BRL",
        },
      }

      console.log(
        "[PIX Create] Enviando evento waiting_payment para UTMify:",
        JSON.stringify(utmfyOrder)
      )
      const utmfyResult = await sendOrderToUtmfy(utmfyOrder)
      console.log("[PIX Create] Resultado UTMify:", utmfyResult)
    } catch (utmfyError) {
      console.error("[PIX Create] Erro ao enviar para UTMify:", utmfyError)
    }

    // Retorna dados do PIX
    return NextResponse.json({
      success: true,
      orderId,
      transactionId,
      pix: {
        qrcode: trexPayResult.pixKey || trexPayResult.qrCode || "",
        qrCodeBase64: trexPayResult.qrCodeBase64 || "",
        expiresAt:
          trexPayResult.expiresAt ||
          new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    })
  } catch (error) {
    console.error("[PIX Create] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno ao processar pagamento" },
      { status: 500 }
    )
  }
}
