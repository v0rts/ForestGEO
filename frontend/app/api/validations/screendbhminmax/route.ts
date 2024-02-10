import {NextRequest, NextResponse} from "next/server";
import {runValidationProcedure} from "@/components/processors/processorhelperfunctions";

export async function GET(request: NextRequest) {
  try {
    const plotIDParam = request.nextUrl.searchParams.get('plotID');
    const censusIDParam = request.nextUrl.searchParams.get('censusID');
    const minDBH = parseInt(request.nextUrl.searchParams.get('min')!);
    const maxDBH = parseInt(request.nextUrl.searchParams.get('max')!);
    const plotID = plotIDParam ? parseInt(plotIDParam) : null;
    const censusID = censusIDParam ? parseInt(censusIDParam) : null;


    const validationResponse = await runValidationProcedure('ValidateScreenMeasuredDiameterMinMax', plotID, censusID, minDBH, maxDBH);
    return new NextResponse(JSON.stringify(validationResponse), {status: 200});
  } catch (error: any) {
    return new NextResponse(JSON.stringify({error: error.message}), {status: 500});
  }
}
