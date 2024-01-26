// FIXED DATA CENSUS ROUTE HANDLERS
import {NextRequest, NextResponse} from "next/server";
import {ErrorMessages, HTTPResponses} from "@/config/macros";
import {CensusRDS} from "@/config/sqlmacros";
import {getSchema, getSqlConnection, parseCensusRequestBody, runQuery} from "@/components/processors/processorhelpers";
import mysql, {PoolConnection} from "mysql2/promise";

export async function GET(request: NextRequest): Promise<NextResponse<{ census: CensusRDS[], totalRows: number }>> {
  let conn: PoolConnection | null = null;
  try {
    const schema = getSchema();
    conn = await getSqlConnection(0); // Utilize the retry mechanism effectively
    const page = parseInt(request.nextUrl.searchParams.get('page')!, 10);
    const pageSize = parseInt(request.nextUrl.searchParams.get('pageSize')!, 10);
    const plotID = parseInt(request.nextUrl.searchParams.get('plotID')!, 10);

    if (isNaN(page) || isNaN(pageSize)) {
      throw new Error('Invalid page, pageSize, or plotID parameter');
    }
    // Initialize the connection attempt counter
    conn = await getSqlConnection(0);

    /// Calculate the starting row for the query based on the page number and page size
    const startRow = page * pageSize;

    // Query to get the paginated data
    let paginatedQuery: string;
    let queryParams: any[];
    if (plotID) {
      paginatedQuery = `
      SELECT SQL_CALC_FOUND_ROWS * FROM ${schema}.Census
      WHERE PlotID = ?
      LIMIT ?, ?
      `;
      queryParams = [plotID, startRow, pageSize];
    } else {
      paginatedQuery = `
      SELECT SQL_CALC_FOUND_ROWS * FROM ${schema}.Census
      LIMIT ?, ?
    `;
      queryParams = [startRow, pageSize];
    }
    const paginatedResults = await runQuery(conn, paginatedQuery, queryParams.map(param => param.toString()));

    // Query to get the total count of rows
    const totalRowsQuery = "SELECT FOUND_ROWS() as totalRows";
    const totalRowsResult = await runQuery(conn, totalRowsQuery);
    const totalRows = totalRowsResult[0].totalRows;

    // Map the results to CensusRDS structure
    const censusRows: CensusRDS[] = paginatedResults.map((row, index) => ({
      id: index + 1,
      censusID: row.CensusID,
      plotID: row.PlotID,
      plotCensusNumber: row.PlotCensusNumber,
      startDate: row.StartDate,
      endDate: row.EndDate,
      description: row.Description,
      // ... other fields as needed
    }));

    return new NextResponse(JSON.stringify({census: censusRows, totalCount: totalRows}), {status: HTTPResponses.OK});
  } catch (error) {
    console.error('Error in GET:', error);
    throw new Error('Failed to fetch census data'); // Providing a more user-friendly error message
  } finally {
    if (conn) conn.release(); // Release the connection
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let conn: PoolConnection | null = null;
  try {
    const schema = getSchema();
    conn = await getSqlConnection(0);
    const newRowData = await parseCensusRequestBody(request, 'POST');
    const insertQuery = mysql.format('INSERT INTO ?? SET ?', [`${schema}.Census`, newRowData]);
    await runQuery(conn, insertQuery);
    return NextResponse.json({message: "Insert successful"}, {status: 200});
  } catch (error) {
    console.error('Error in POST:', error);
    return NextResponse.json({message: ErrorMessages.ICF}, {status: 400});
  } finally {
    if (conn) conn.release(); // Release the connection
  }
}

export async function PATCH(request: NextRequest) {
  let conn: PoolConnection | null = null;
  try {
    const schema = getSchema();
    const {censusID, updateData} = await parseCensusRequestBody(request, 'PATCH');
    conn = await getSqlConnection(0);

    const updateQuery = mysql.format('UPDATE ?? SET ? WHERE CensusID = ?', [`${schema}.Census`, updateData, censusID]);
    await runQuery(conn, updateQuery);

    return NextResponse.json({message: "Update successful"}, {status: HTTPResponses.OK});
  } catch (error) {
    console.error('Error in PATCH:', error);
    return NextResponse.json({message: ErrorMessages.UCF}, {status: 400});
  } finally {
    if (conn) conn.release(); // Release the connection
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let conn: PoolConnection | null = null;
  try {
    const schema = getSchema();
    conn = await getSqlConnection(0);

    const deleteID = parseInt(request.nextUrl.searchParams.get('censusID')!);
    if (isNaN(deleteID)) {
      return NextResponse.json({message: "Invalid censusID parameter"}, {status: 400});
    }

    const deleteQuery = `DELETE FROM ${schema}.Census WHERE CensusID = ?`;
    await runQuery(conn, deleteQuery, [deleteID]);

    return NextResponse.json({message: "Delete successful"}, {status: HTTPResponses.OK});
  } catch (error) {
    console.error('Error in DELETE:', error);
    return NextResponse.json({message: ErrorMessages.DCF}, {status: 400});
  } finally {
    if (conn) conn.release(); // Release the connection
  }
}
