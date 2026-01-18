import { NextResponse } from "next/server"

export async function GET() {
  const trexpayToken = process.env.TREXPAY_TOKEN
  const trexpaySecret = process.env.TREXPAY_SECRET
  
  const config = {
    trexpay: {
      token: trexpayToken ? `Configurado (${trexpayToken.substring(0, 8)}...)` : "NAO CONFIGURADO",
      secret: trexpaySecret ? "Configurado" : "NAO CONFIGURADO",
      tokenLength: trexpayToken?.length || 0,
      secretLength: trexpaySecret?.length || 0,
    },
    utmfy: {
      apiToken: process.env.UTMFY_API_TOKEN ? "Configurado" : "NAO CONFIGURADO",
    },
    app: {
      url: process.env.NEXT_PUBLIC_APP_URL || "NAO CONFIGURADO",
      vercelUrl: process.env.VERCEL_URL || "NAO CONFIGURADO",
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "NAO CONFIGURADO",
    },
    environment: process.env.NODE_ENV,
  }

  // Test TrexPay connection
  let trexpayConnection = "NAO TESTADO"
  if (trexpayToken && trexpaySecret) {
    try {
      const testResponse = await fetch("https://app.trexpay.com.br/api/wallet/deposit/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          token: trexpayToken,
          secret: trexpaySecret,
          postback: "https://example.com/webhook",
          amount: 1.00,
          debtor_name: "Teste Conexao",
          email: "teste@teste.com",
          debtor_document_number: "12345678900",
          phone: "+5511999999999",
          method_pay: "pix",
        }),
      })

      const responseText = await testResponse.text()
      
      if (testResponse.ok) {
        trexpayConnection = `CONECTADO - Status ${testResponse.status}`
        try {
          const data = JSON.parse(responseText)
          trexpayConnection += ` - Resposta: ${JSON.stringify(data).substring(0, 200)}...`
        } catch {
          trexpayConnection += ` - Resposta: ${responseText.substring(0, 200)}...`
        }
      } else {
        trexpayConnection = `ERRO HTTP ${testResponse.status}: ${responseText.substring(0, 300)}`
      }
    } catch (error) {
      trexpayConnection = `ERRO DE CONEXAO: ${error instanceof Error ? error.message : String(error)}`
    }
  } else {
    trexpayConnection = "CREDENCIAIS NAO CONFIGURADAS"
  }

  // Test UTMFY connection
  let utmfyConnection = "NAO TESTADO"
  if (process.env.UTMFY_API_TOKEN) {
    try {
      const response = await fetch("https://api.utmify.com.br/api-credentials/orders", {
        method: "POST",
        headers: {
          "x-api-token": process.env.UTMFY_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: "TEST-" + Date.now(),
          platform: "CometaPapelaria",
          paymentMethod: "pix",
          status: "waiting_payment",
          createdAt: new Date().toISOString().replace("T", " ").substring(0, 19),
          approvedDate: null,
          refundedAt: null,
          customer: {
            name: "Teste Conexao",
            email: "teste@teste.com",
            phone: "11999999999",
            document: "12345678900",
            country: "BR",
          },
          products: [
            {
              id: "test-product",
              name: "Produto Teste",
              planId: null,
              planName: null,
              quantity: 1,
              priceInCents: 100,
            },
          ],
          trackingParameters: {
            src: null,
            sck: null,
            utm_source: null,
            utm_campaign: null,
            utm_medium: null,
            utm_content: null,
            utm_term: null,
          },
          commission: {
            totalPriceInCents: 100,
            gatewayFeeInCents: 10,
            userCommissionInCents: 90,
            currency: "BRL",
          },
          isTest: true,
        }),
      })

      if (response.ok) {
        utmfyConnection = "CONECTADO - Pedido de teste enviado!"
      } else {
        const error = await response.json()
        utmfyConnection = `ERRO: ${JSON.stringify(error)}`
      }
    } catch (error) {
      utmfyConnection = `ERRO DE CONEXAO: ${error}`
    }
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

  return NextResponse.json({
    ...config,
    trexpayConnection,
    utmfyConnection,
    webhooks: {
      trexpay: `${baseUrl}/api/webhook/trexpay`,
    },
    instructions: {
      testeManual: "Acesse /api/debug/status para ver o status das configuracoes",
      trexpay: "Configure TREXPAY_TOKEN e TREXPAY_SECRET nas variáveis de ambiente",
      utmfy: "Configure UTMFY_API_TOKEN nas variáveis de ambiente",
      webhook: "Configure a URL de postback na TrexPay para receber notificações de pagamento",
    },
  })
}
