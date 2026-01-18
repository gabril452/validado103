import { type NextRequest, NextResponse } from "next/server"
import {
  verifyWebhookSignature,
  processPixInWebhook,
  type TrexPayWebhookPayload,
} from "@/lib/trexpay"
import {
  sendOrderToUtmfy,
  formatUtmfyDate,
  type UtmfyOrderRequest,
} from "@/lib/utmfy"
import { getUtmParams } from "@/lib/server-utm-store"

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("x-trexpay-signature") || ""
    const body = await request.json()

    console.log("[TrexPay Webhook] Recebido evento:", body.event)

    // Verificar assinatura
    const secret = process.env.TREXPAY_SECRET
    if (secret && signature) {
      const isValid = verifyWebhookSignature(body, signature, secret)
      if (!isValid) {
        console.error("[TrexPay Webhook] Assinatura inválida")
        return NextResponse.json(
          { error: "Assinatura inválida" },
          { status: 401 }
        )
      }
    }

    const payload = body as TrexPayWebhookPayload

    // Processar evento de pagamento recebido (PIX IN)
    if (payload.event === "pix.received") {
      const pixData = processPixInWebhook(payload)
      console.log("[TrexPay Webhook] PIX recebido:", pixData)

      // Se o pagamento foi aprovado, enviar para UTMify
      if (pixData.status === "paid") {
        try {
          const storedUtmParams = getUtmParams(pixData.transactionId)

          const utmfyOrder: UtmfyOrderRequest = {
            orderId: pixData.transactionId,
            platform: "papelaria-site",
            paymentMethod: "pix",
            status: "paid",
            createdAt: formatUtmfyDate(new Date()),
            approvedDate: formatUtmfyDate(
              pixData.paidAt ? new Date(pixData.paidAt) : new Date()
            ),
            refundedAt: null,
            customer: {
              name: pixData.payerName || "Cliente",
              email: null,
              phone: null,
              document: pixData.payerDocument || null,
              country: "BR",
            },
            products: [
              {
                id: "pix-payment",
                name: "Pagamento PIX",
                planId: null,
                planName: null,
                quantity: 1,
                priceInCents: Math.round(pixData.amount * 100),
              },
            ],
            trackingParameters: storedUtmParams || {
              src: null,
              sck: null,
              utm_source: null,
              utm_campaign: null,
              utm_medium: null,
              utm_content: null,
              utm_term: null,
            },
            commission: {
              totalPriceInCents: Math.round(pixData.amount * 100),
              gatewayFeeInCents: 0,
              userCommissionInCents: Math.round(pixData.amount * 100),
              currency: "BRL",
            },
          }

          console.log("[TrexPay Webhook] Enviando para UTMify:", utmfyOrder)
          await sendOrderToUtmfy(utmfyOrder)
        } catch (utmfyError) {
          console.error("[TrexPay Webhook] Erro ao enviar para UTMify:", utmfyError)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TrexPay Webhook] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno ao processar webhook" },
      { status: 500 }
    )
  }
}
