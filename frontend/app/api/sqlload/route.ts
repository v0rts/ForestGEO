import {NextRequest, NextResponse} from "next/server";
import {getSqlConnection, InsertUpdateProcessingProps} from "@/components/processors/processormacros";
import {PoolConnection} from "mysql2/promise";
import {FileRow, FileRowSet, HTTPResponses} from "@/config/macros";
import {insertOrUpdate} from "@/components/processors/processorhelperfunctions";

export async function POST(request: NextRequest) {
  const fileRowSet: FileRowSet = await request.json();
  console.log(`file row set: ${Object.keys(fileRowSet)}`);
  const fileName = request.nextUrl.searchParams.get('fileName')!.trim();
  const plotID = parseInt(request.nextUrl.searchParams.get("plot")!.trim());
  const censusID = parseInt(request.nextUrl.searchParams.get("census")!.trim());
  const fullName = request.nextUrl.searchParams.get("user")!;
  const formType = request.nextUrl.searchParams.get("formType")!.trim();

  let connection: PoolConnection | null = null; // Use PoolConnection type

  try {
    let i = 0;
    connection = await getSqlConnection(i);
    if (!connection) {
      throw new Error("SQL connection failed");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error processing files:", error.message);
      return new NextResponse(
        JSON.stringify({
          responseMessage: `Failure in connecting to SQL with ${error.message}`,
          error: error.message,
        }),
        {status: HTTPResponses.SQL_CONNECTION_FAILURE}
      );
    } else {
      console.error("Unknown error in connecting to SQL:", error);
      return new NextResponse(
        JSON.stringify({
          responseMessage: `Unknown SQL connection error with error: ${error}`,
        }),
        {status: HTTPResponses.SQL_CONNECTION_FAILURE}
      );
    }
  }

  if (!connection) {
    console.error("Container client or SQL connection is undefined.");
    return new NextResponse(
      JSON.stringify({
        responseMessage: "Container client or SQL connection is undefined",
      }),
      {status: HTTPResponses.SERVICE_UNAVAILABLE}
    );
  }

  let idToRows: { coreMeasurementID: number; fileRow: FileRow }[] = [];
  for (const rowId in fileRowSet) {
    console.log(`rowID: ${rowId}`);
    const row = fileRowSet[rowId];
    try {
      let props: InsertUpdateProcessingProps = {connection, formType, rowData: row, plotID, censusID, fullName};
      const coreMeasurementID = await insertOrUpdate(props);
      if (formType === 'fixeddata_census' && coreMeasurementID) {
        idToRows.push({coreMeasurementID: coreMeasurementID, fileRow: row});
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error processing row for file ${fileName}:`, error.message);
        return new NextResponse(
          JSON.stringify({
            responseMessage: `Error processing row in file ${fileName}`,
            error: error.message,
          }),
          {status: HTTPResponses.SERVICE_UNAVAILABLE}
        );
      } else {
        console.error("Unknown error processing row:", error);
        return new NextResponse(
          JSON.stringify({
            responseMessage: `Unknown processing error at row, in file ${fileName}`,
          }),
          {status: HTTPResponses.SERVICE_UNAVAILABLE}
        );
      }
    } finally {
      if (connection) connection.release();
    }
  }
  return new NextResponse(JSON.stringify({message: "Insert to SQL successful", idToRows: idToRows}), {status: 200});
}