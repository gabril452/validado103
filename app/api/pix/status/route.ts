import { type NextRequest, NextResponse } from "next/server"
import { getPixStatus } from "@/lib/trexpay"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transactionId")

    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId é obrigatório" },
        { status: 400 }
      )
    }

    console.log("[PIX Status] Consultando transação:", transactionId)

    // Consultar status na TrexPay
    const result = await getPixStatus(transactionId)

    if (!result.success) {
      console.error("[PIX Status] Erro ao consultar:", result.error)
    }

    // Mapear status da TrexPay para o formato esperado pelo frontend
    let mappedStatus = "pending"
    if (result.status === "paid") {
      mappedStatus = "paid"
    } else if (result.status === "expired") {
      mappedStatus = "expired"
    } else if (result.status === "cancelled") {
      mappedStatus = "cancelled"
    }

    return NextResponse.json({
      success: true,
      transactionId,
      status: mappedStatus,
      amount: result.amount,
      paidAt: result.paid_at,
    })
  } catch (error) {
    console.error("[PIX Status] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno ao consultar status" },
      { status: 500 }
    )
  }
}
