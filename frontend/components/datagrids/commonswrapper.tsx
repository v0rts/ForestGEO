'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { GridColDef, GridRowModes, GridRowModesModel, GridRowsProp } from '@mui/x-data-grid';
import { AlertProps } from '@mui/material';
import { randomId } from '@mui/x-data-grid-generator';
import DataGridCommons from '@/components/datagrids/datagridcommons';
import { Box, Button, Typography } from '@mui/joy';
import UploadParentModal from '@/components/uploadsystemhelpers/uploadparentmodal';
import { FormType } from '@/config/macros/formdetails';
import { useOrgCensusContext, usePlotContext, useSiteContext } from '@/app/contexts/userselectionprovider';

interface CommonsWrapperProps {
  initialRow: any;
  gridType: string;
  gridFieldToFocus: string;
  gridColumns: GridColDef[] | ((relatedData?: any) => GridColDef[]);
  uploadFormType?: FormType;
}

export default function CommonsWrapper({ initialRow, gridType, gridFieldToFocus, gridColumns, uploadFormType }: CommonsWrapperProps) {
  const [rows, setRows] = useState<GridRowsProp>([initialRow]);
  const [rowCount, setRowCount] = useState(0);
  const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});
  const [snackbar, setSnackbar] = useState<Pick<AlertProps, 'children' | 'severity'> | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [isNewRowAdded, setIsNewRowAdded] = useState(false);
  const [shouldAddRowAfterFetch, setShouldAddRowAfterFetch] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [relatedData, setRelatedData] = useState<any[]>([]);
  const currentPlot = usePlotContext();
  const currentSite = useSiteContext();
  const currentCensus = useOrgCensusContext();

  useEffect(() => {
    if (rows[0] !== initialRow) {
      async function fetchRelatedData() {
        if (gridType === 'personnel') {
          const roleResponse = await fetch(`/api/fetchall/roles/undefined/undefined/undefined?schema=${currentSite?.schemaName}`, {
            method: 'GET'
          });
          setRelatedData(await roleResponse.json());
        }
      }

      fetchRelatedData().catch(console.error);
    }
  }, [rows, initialRow, gridType]);

  const addNewRowToGrid = useCallback(() => {
    const id = randomId();
    const newRow = { ...initialRow, id, isNew: true };

    setRows(oldRows => [...oldRows, newRow]);
    setRowModesModel(oldModel => ({
      ...oldModel,
      [id]: { mode: GridRowModes.Edit, fieldToFocus: gridFieldToFocus }
    }));
  }, [initialRow, gridFieldToFocus]);

  // Determine the actual columns based on whether gridColumns is a function or an array
  const actualColumns = typeof gridColumns === 'function' ? gridColumns(relatedData) : gridColumns;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, width: '100%' }}>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'warning.main',
            borderRadius: '4px',
            p: 2
          }}
        >
          <Typography level="title-lg" sx={{ color: '#ffa726' }}>
            Note: ADMINISTRATOR VIEW
          </Typography>
          {uploadFormType && (
            <Button onClick={() => setIsUploadModalOpen(true)} variant="solid" color="primary">
              Upload
            </Button>
          )}
        </Box>
      </Box>

      {uploadFormType && (
        <UploadParentModal
          isUploadModalOpen={isUploadModalOpen}
          handleCloseUploadModal={() => {
            setIsUploadModalOpen(false);
            setRefresh(true);
          }}
          formType={uploadFormType}
        />
      )}

      <DataGridCommons
        gridType={gridType}
        gridColumns={actualColumns} // Use the determined columns
        rows={rows}
        setRows={setRows}
        rowCount={rowCount}
        setRowCount={setRowCount}
        rowModesModel={rowModesModel}
        setRowModesModel={setRowModesModel}
        snackbar={snackbar}
        setSnackbar={setSnackbar}
        refresh={refresh}
        setRefresh={setRefresh}
        paginationModel={paginationModel}
        setPaginationModel={setPaginationModel}
        isNewRowAdded={isNewRowAdded}
        setIsNewRowAdded={setIsNewRowAdded}
        shouldAddRowAfterFetch={shouldAddRowAfterFetch}
        setShouldAddRowAfterFetch={setShouldAddRowAfterFetch}
        addNewRowToGrid={addNewRowToGrid}
      />
    </>
  );
}
