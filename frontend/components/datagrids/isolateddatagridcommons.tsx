'use client';

import {
  CellItemContainer,
  createDeleteQuery,
  createFetchQuery,
  createPostPatchQuery,
  createQFFetchQuery,
  EditToolbarCustomProps,
  filterColumns,
  getColumnVisibilityModel,
  getGridID,
  IsolatedDataGridCommonProps,
  PendingAction
} from '@/config/datagridhelpers';
import {
  GridActionsCellItem,
  GridColDef,
  GridEventListener,
  GridFilterModel,
  GridRowEditStopReasons,
  GridRowId,
  GridRowModel,
  GridRowModes,
  GridRowModesModel,
  GridRowsProp,
  GridToolbarContainer,
  GridToolbarProps,
  GridToolbarQuickFilter,
  ToolbarPropsOverrides,
  useGridApiRef
} from '@mui/x-data-grid';
import { Alert, AlertProps, Button, IconButton, Snackbar } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrgCensusContext, usePlotContext, useQuadratContext, useSiteContext } from '@/app/contexts/userselectionprovider';
import { useDataValidityContext } from '@/app/contexts/datavalidityprovider';
import { useSession } from 'next-auth/react';
import { HTTPResponses, UnifiedValidityFlags } from '@/config/macros';
import { Tooltip, Typography } from '@mui/joy';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { redirect } from 'next/navigation';
import Box from '@mui/joy/Box';
import { StyledDataGrid } from '@/config/styleddatagrid';
import ConfirmationDialog from '@/components/datagrids/confirmationdialog';
import { randomId } from '@mui/x-data-grid-generator';
import SkipReEnterDataModal from '@/components/datagrids/skipreentrydatamodal';
import { FileDownloadTwoTone } from '@mui/icons-material';
import { FormType, getTableHeaders } from '@/config/macros/formdetails';
import { applyFilterToColumns } from '@/components/datagrids/filtrationsystem';
import { ClearIcon } from '@mui/x-date-pickers';

type EditToolbarProps = EditToolbarCustomProps & GridToolbarProps & ToolbarPropsOverrides;

const EditToolbar = ({ handleAddNewRow, handleRefresh, handleExportAll, handleExportCSV, handleQuickFilterChange, locked, filterModel }: EditToolbarProps) => {
  if (!handleAddNewRow || !handleRefresh || !handleQuickFilterChange) return <></>;
  const handleExportClick = async () => {
    if (!handleExportAll) return;
    const fullData = await handleExportAll(filterModel);
    const blob = new Blob([JSON.stringify(fullData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setIsTyping(true); // Show tooltip when user starts typing
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleQuickFilterChange(inputValue);
      setIsTyping(false); // Hide tooltip when Enter is pressed
    }
  };

  const handleClearInput = () => {
    setInputValue('');
    handleQuickFilterChange(''); // Clear the filter
    setIsTyping(false); // Hide tooltip when input is cleared
  };

  useEffect(() => {
    if (isTyping) {
      const timeout = setTimeout(() => setIsTyping(false), 2000);
      return () => clearTimeout(timeout); // Clear timeout if user resumes typing
    }
  }, [isTyping, inputValue]);

  return (
    <GridToolbarContainer>
      <Tooltip title={'Press Enter to apply filter'} open={isTyping} placement={'bottom'} arrow>
        <Box display={'flex'} alignItems={'center'}>
          <GridToolbarQuickFilter
            variant={'outlined'}
            value={inputValue}
            onKeyDown={handleKeyDown}
            onChange={handleInputChange}
            placeholder={'Search All Fields...'}
          />
          <Tooltip title={'Clear filter'} placement={'right'}>
            <IconButton aria-label={'clear filter'} disabled={inputValue === ''} onClick={handleClearInput} size={'small'} edge={'end'} sx={{ marginLeft: 1 }}>
              <ClearIcon fontSize={'small'} />
            </IconButton>
          </Tooltip>
        </Box>
      </Tooltip>
      <Button color={'primary'} startIcon={<AddIcon />} onClick={async () => await handleAddNewRow()} disabled={locked}>
        Add Row
      </Button>
      <Button color={'primary'} startIcon={<RefreshIcon />} onClick={async () => await handleRefresh()}>
        Refresh
      </Button>
      <Button color={'primary'} startIcon={<FileDownloadIcon />} onClick={handleExportClick}>
        Export Full Data
      </Button>
      <Button color={'primary'} startIcon={<FileDownloadTwoTone />} onClick={handleExportCSV}>
        Export as Form CSV
      </Button>
    </GridToolbarContainer>
  );
};

export default function IsolatedDataGridCommons(props: Readonly<IsolatedDataGridCommonProps>) {
  const { gridColumns, gridType, refresh, setRefresh, locked = false, selectionOptions, initialRow, fieldToFocus, clusters } = props;

  const [rows, setRows] = useState([initialRow] as GridRowsProp);
  const [rowCount, setRowCount] = useState(0);
  const [rowModesModel, setRowModesModel] = useState<GridRowModesModel>({});
  const [snackbar, setSnackbar] = React.useState<Pick<AlertProps, 'children' | 'severity'> | null>(null);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10
  });
  const [loading, setLoading] = useState(false);
  const [isNewRowAdded, setIsNewRowAdded] = useState(false);
  const [shouldAddRowAfterFetch, setShouldAddRowAfterFetch] = useState(false);
  const [newLastPage, setNewLastPage] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>({
    actionType: '',
    actionId: null
  });
  const [promiseArguments, setPromiseArguments] = useState<{
    resolve: (value: GridRowModel) => void;
    reject: (reason?: any) => void;
    newRow: GridRowModel;
    oldRow: GridRowModel;
  } | null>(null);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({
    items: []
  });
  const [quickFilter, setQuickFilter] = useState('');

  const currentPlot = usePlotContext();
  const currentCensus = useOrgCensusContext();
  const currentQuadrat = useQuadratContext();
  const currentSite = useSiteContext();

  const { triggerRefresh } = useDataValidityContext();

  useSession();

  const apiRef = useGridApiRef();

  useEffect(() => {
    if (currentPlot?.plotID || currentCensus?.plotCensusNumber || !isNewRowAdded) {
      fetchPaginatedData(paginationModel.page).catch(console.error);
    }
  }, [currentPlot, currentCensus, paginationModel.page, quickFilter]);

  useEffect(() => {
    if (refresh && currentSite) {
      handleRefresh().then(() => {
        if (refresh) {
          setRefresh(false);
        }
      });
    }
  }, [refresh, currentSite]);

  useEffect(() => {
    const updatedRowModesModel = rows.reduce((acc, row) => {
      if (row.id) {
        acc[row.id] = rowModesModel[row.id] || { mode: GridRowModes.View };
      }
      return acc;
    }, {} as GridRowModesModel);

    const cleanedRowModesModel = Object.fromEntries(Object.entries(updatedRowModesModel).filter(([key]) => key !== '0'));

    if (JSON.stringify(cleanedRowModesModel) !== JSON.stringify(rowModesModel)) {
      setRowModesModel(cleanedRowModesModel);
    }
  }, [rows]);

  const fetchFullData = useCallback(async () => {
    setLoading(true);
    let partialQuery = ``;
    if (currentPlot?.plotID) partialQuery += `/${currentPlot.plotID}`;
    if (currentCensus?.plotCensusNumber) partialQuery += `/${currentCensus.plotCensusNumber}`;
    if (currentQuadrat?.quadratID) partialQuery += `/${currentQuadrat.quadratID}`;
    const fullDataQuery = `/api/fetchall/${gridType}` + partialQuery + `?schema=${currentSite?.schemaName}`;

    try {
      const response = await fetch(fullDataQuery, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterModel)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error fetching full data');
      return data.output;
    } catch (error) {
      console.error('Error fetching full data:', error);
      setSnackbar({ children: 'Error fetching full data', severity: 'error' });
      return [];
    } finally {
      setLoading(false);
    }
  }, [filterModel, currentPlot, currentCensus, currentQuadrat, currentSite, gridType, setLoading]);

  const exportAllCSV = useCallback(async () => {
    setLoading(true);
    switch (gridType) {
      case 'attributes':
        const aResponse = await fetch(
          `/api/formdownload/attributes/${currentSite?.schemaName ?? ''}/${currentPlot?.plotID ?? 0}/${currentCensus?.dateRanges[0].censusID ?? 0}`,
          { method: 'GET' }
        );
        const aData = await aResponse.json();
        let aCSVRows =
          getTableHeaders(FormType.attributes)
            .map(row => row.label)
            .join(',') + '\n';
        aData.forEach((row: any) => {
          const values = getTableHeaders(FormType.attributes)
            .map(rowHeader => rowHeader.label)
            .map(header => row[header])
            .map(value => {
              if (value === undefined || value === null || value === '') {
                return null;
              }
              if (typeof value === 'number') {
                return value;
              }
              const parsedValue = parseFloat(value);
              if (!isNaN(parsedValue)) {
                return parsedValue;
              }
              if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                value = `"${value}"`;
              }

              return value;
            });
          aCSVRows += values.join(',') + '\n';
        });
        const aBlob = new Blob([aCSVRows], {
          type: 'text/csv;charset=utf-8;'
        });
        const aURL = URL.createObjectURL(aBlob);
        const aLink = document.createElement('a');
        aLink.href = aURL;
        aLink.download = `attributesform_${currentSite?.schemaName ?? ''}_${currentPlot?.plotName ?? ''}_${currentCensus?.plotCensusNumber ?? 0}.csv`;
        document.body.appendChild(aLink);
        aLink.click();
        document.body.removeChild(aLink);
        break;
      case 'quadrats':
        const qResponse = await fetch(
          `/api/formdownload/quadrats/${currentSite?.schemaName ?? ''}/${currentPlot?.plotID ?? 0}/${currentCensus?.dateRanges[0].censusID ?? 0}`,
          { method: 'GET' }
        );
        const qData = await qResponse.json();
        let qCSVRows =
          getTableHeaders(FormType.quadrats)
            .map(row => row.label)
            .join(',') + '\n';
        qData.forEach((row: any) => {
          const values = getTableHeaders(FormType.quadrats)
            .map(rowHeader => rowHeader.label)
            .map(header => row[header])
            .map(value => {
              if (value === undefined || value === null || value === '') {
                return null;
              }
              if (typeof value === 'number') {
                return value;
              }
              const parsedValue = parseFloat(value);
              if (!isNaN(parsedValue)) {
                return parsedValue;
              }
              if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                value = `"${value}"`;
              }

              return value;
            });
          qCSVRows += values.join(',') + '\n';
        });
        const qBlob = new Blob([qCSVRows], {
          type: 'text/csv;charset=utf-8;'
        });
        const qURL = URL.createObjectURL(qBlob);
        const qLink = document.createElement('a');
        qLink.href = qURL;
        qLink.download = `quadratsform_${currentSite?.schemaName ?? ''}_${currentPlot?.plotName ?? ''}_${currentCensus?.plotCensusNumber ?? 0}.csv`;
        document.body.appendChild(qLink);
        qLink.click();
        document.body.removeChild(qLink);
        break;
      case 'personnel':
        const pResponse = await fetch(
          `/api/formdownload/personnel/${currentSite?.schemaName ?? ''}/${currentPlot?.plotID ?? 0}/${currentCensus?.dateRanges[0].censusID ?? 0}`,
          { method: 'GET' }
        );
        const pData = await pResponse.json();
        let pCSVRows =
          getTableHeaders(FormType.personnel)
            .map(row => row.label)
            .join(',') + '\n';
        pData.forEach((row: any) => {
          const values = getTableHeaders(FormType.personnel)
            .map(rowHeader => rowHeader.label)
            .map(header => row[header])
            .map(value => {
              if (value === undefined || value === null || value === '') {
                return null;
              }
              if (typeof value === 'number') {
                return value;
              }
              const parsedValue = parseFloat(value);
              if (!isNaN(parsedValue)) {
                return parsedValue;
              }
              if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                value = `"${value}"`;
              }

              return value;
            });
          pCSVRows += values.join(',') + '\n';
        });
        const pBlob = new Blob([pCSVRows], {
          type: 'text/csv;charset=utf-8;'
        });
        const pURL = URL.createObjectURL(pBlob);
        const pLink = document.createElement('a');
        pLink.href = pURL;
        pLink.download = `personnelform_${currentSite?.schemaName ?? ''}_${currentPlot?.plotName ?? ''}_${currentCensus?.plotCensusNumber ?? 0}.csv`;
        document.body.appendChild(pLink);
        pLink.click();
        document.body.removeChild(pLink);
        break;
      case 'species':
      case 'alltaxonomiesview':
        const sResponse = await fetch(
          `/api/formdownload/species/${currentSite?.schemaName ?? ''}/${currentPlot?.plotID ?? 0}/${currentCensus?.dateRanges[0].censusID ?? 0}`,
          { method: 'GET' }
        );
        const sData = await sResponse.json();
        let sCSVRows =
          getTableHeaders(FormType.species)
            .map(row => row.label)
            .join(',') + '\n';
        sData.forEach((row: any) => {
          const values = getTableHeaders(FormType.species)
            .map(rowHeader => rowHeader.label)
            .map(header => row[header])
            .map(value => {
              if (value === undefined || value === null || value === '') {
                return null;
              }
              if (typeof value === 'number') {
                return value;
              }
              const parsedValue = parseFloat(value);
              if (!isNaN(parsedValue)) {
                return parsedValue;
              }
              if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                value = `"${value}"`;
              }

              return value;
            });
          sCSVRows += values.join(',') + '\n';
        });
        const sBlob = new Blob([sCSVRows], {
          type: 'text/csv;charset=utf-8;'
        });
        const sURL = URL.createObjectURL(sBlob);
        const sLink = document.createElement('a');
        sLink.href = sURL;
        sLink.download = `speciesform_${currentSite?.schemaName ?? ''}_${currentPlot?.plotName ?? ''}_${currentCensus?.plotCensusNumber ?? 0}.csv`;
        document.body.appendChild(sLink);
        sLink.click();
        document.body.removeChild(sLink);
        break;
    }
    setLoading(false);
  }, [currentPlot, currentCensus, currentSite, gridType]);

  const openConfirmationDialog = useCallback(
    (actionType: 'save' | 'delete', actionId: GridRowId) => {
      setPendingAction({ actionType, actionId });

      const row = rows.find(row => String(row.id) === String(actionId));
      if (row) {
        if (actionType === 'delete') {
          setIsDeleteDialogOpen(true);
        } else {
          setIsDialogOpen(true);
        }
      }
    },
    [rows]
  );

  const handleConfirmAction = useCallback(
    async (confirmedRow?: GridRowModel) => {
      setIsDialogOpen(false);
      setIsDeleteDialogOpen(false);

      if (pendingAction.actionType === 'delete' && pendingAction.actionId !== null) {
        await performDeleteAction(pendingAction.actionId);
      } else if (promiseArguments) {
        try {
          console.log('handleconfirmaction: confirmedRow: ', confirmedRow);
          console.log('handleconfirmaction: promiseArguments.newRow: ', promiseArguments.newRow);
          const resolvedRow = confirmedRow || promiseArguments.newRow;
          console.log('handleconfirmaction: resolvedRow: ', resolvedRow);
          await performSaveAction(promiseArguments.newRow.id, resolvedRow);
          setSnackbar({ children: 'Row successfully updated!', severity: 'success' });
        } catch (error: any) {
          setSnackbar({ children: `Error: ${error.message}`, severity: 'error' });
        }
      }

      setPendingAction({ actionType: '', actionId: null });
      setPromiseArguments(null);
    },
    [pendingAction, promiseArguments]
  );

  const handleCancelAction = useCallback(() => {
    setIsDialogOpen(false);
    setIsDeleteDialogOpen(false);
    if (promiseArguments) {
      promiseArguments.reject(new Error('Action cancelled by user'));
    }
    setPendingAction({ actionType: '', actionId: null });
    setPromiseArguments(null);
  }, [promiseArguments]);

  const performSaveAction = useCallback(
    async (id: GridRowId, confirmedRow: GridRowModel) => {
      if (locked || !promiseArguments) return;

      setLoading(true);
      try {
        setRowModesModel(prevModel => ({
          ...prevModel,
          [id]: { mode: GridRowModes.View }
        }));

        const updatedRow = await updateRow(
          gridType,
          currentSite?.schemaName,
          confirmedRow,
          promiseArguments.oldRow,
          setSnackbar,
          setIsNewRowAdded,
          setShouldAddRowAfterFetch,
          fetchPaginatedData,
          paginationModel
        );

        promiseArguments.resolve(updatedRow);

        if (props.onDataUpdate) {
          props.onDataUpdate();
        }
      } catch (error) {
        promiseArguments.reject(error);
      } finally {
        setLoading(false);
      }

      triggerRefresh();
      setLoading(false);
      await fetchPaginatedData(paginationModel.page);
    },
    [
      locked,
      promiseArguments,
      gridType,
      currentSite,
      setSnackbar,
      setIsNewRowAdded,
      setShouldAddRowAfterFetch,
      paginationModel,
      rows,
      triggerRefresh,
      setLoading
    ]
  );

  const performDeleteAction = useCallback(
    async (id: GridRowId) => {
      if (locked) return;

      setLoading(true);

      const rowToDelete = rows.find(row => String(row.id) === String(id));
      if (!rowToDelete) return;

      const deleteQuery = createDeleteQuery(currentSite?.schemaName ?? '', gridType, getGridID(gridType), rowToDelete.id);

      try {
        const response = await fetch(deleteQuery, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ newRow: rowToDelete })
        });

        if (!response.ok) {
          const error = await response.json();
          if (response.status === HTTPResponses.FOREIGN_KEY_CONFLICT) {
            setSnackbar({
              children: `Error: Cannot delete row due to foreign key constraint in table ${error.referencingTable}`,
              severity: 'error'
            });
          } else {
            setSnackbar({
              children: `Error: ${error.message || 'Deletion failed'}`,
              severity: 'error'
            });
          }
        } else {
          setRows(prevRows => prevRows.filter(row => row.id !== id));
          setSnackbar({
            children: 'Row successfully deleted',
            severity: 'success'
          });
          triggerRefresh([gridType as keyof UnifiedValidityFlags]);
          await fetchPaginatedData(paginationModel.page);
        }
      } catch (error: any) {
        setSnackbar({
          children: `Error: ${error.message || 'Deletion failed'}`,
          severity: 'error'
        });
      } finally {
        setLoading(false);
      }
    },
    [locked, rows, currentSite, gridType, setSnackbar, paginationModel, triggerRefresh, setLoading]
  );

  const handleSaveClick = useCallback(
    (id: GridRowId) => () => {
      if (locked) return;

      const updatedRowModesModel = { ...rowModesModel };
      if (!updatedRowModesModel[id] || updatedRowModesModel[id].mode === undefined) {
        updatedRowModesModel[id] = { mode: GridRowModes.View };
      }

      apiRef.current.stopRowEditMode({ id, ignoreModifications: true });

      const oldRow = rows.find(row => String(row.id) === String(id));

      const updatedRow = apiRef.current.getRowWithUpdatedValues(id, 'anyField');

      if (oldRow && updatedRow) {
        setPromiseArguments({
          resolve: (value: GridRowModel) => {},
          reject: (reason?: any) => {},
          oldRow,
          newRow: updatedRow
        });

        openConfirmationDialog('save', id);
      }
    },
    [locked, rowModesModel, rows, apiRef, openConfirmationDialog]
  );

  const handleDeleteClick = useCallback(
    (id: GridRowId) => () => {
      if (locked) return;
      if (gridType === 'census') {
        const rowToDelete = rows.find(row => String(row.id) === String(id));
        if (currentCensus && rowToDelete && rowToDelete.censusID === currentCensus.dateRanges[0].censusID) {
          alert('Cannot delete the currently selected census.');
          return;
        }
      }
      openConfirmationDialog('delete', id);
    },
    [locked, gridType, currentCensus, rows, openConfirmationDialog]
  );

  const handleAddNewRow = useCallback(() => {
    if (locked) return;
    if (isNewRowAdded) return;
    const newRowCount = rowCount + 1;
    const calculatedNewLastPage = Math.ceil(newRowCount / paginationModel.pageSize) - 1;
    const existingLastPage = Math.ceil(rowCount / paginationModel.pageSize) - 1;
    const isNewPageNeeded = newRowCount % paginationModel.pageSize === 1;
    if (isNewPageNeeded) {
      setPaginationModel({ ...paginationModel, page: calculatedNewLastPage });
    } else {
      setPaginationModel({ ...paginationModel, page: existingLastPage });
    }
    const id = randomId();
    const newRow = { ...initialRow, id, isNew: true };
    setRows(prevRows => {
      return [...prevRows, newRow];
    });
    setRowModesModel(prevModel => {
      return {
        ...prevModel,
        [id]: { mode: GridRowModes.Edit, fieldToFocus }
      };
    });

    setShouldAddRowAfterFetch(isNewPageNeeded);
    setNewLastPage(calculatedNewLastPage);
    setIsNewRowAdded(true);
  }, [locked, isNewRowAdded, rowCount, paginationModel, initialRow, setRows, setRowModesModel, fieldToFocus]);

  const handleRefresh = useCallback(async () => {
    await fetchPaginatedData(paginationModel.page);
  }, [paginationModel.page]);

  const fetchPaginatedData = async (pageToFetch: number) => {
    setLoading(true);
    const paginatedQuery =
      quickFilter === ''
        ? createFetchQuery(
            currentSite?.schemaName ?? '',
            gridType,
            pageToFetch,
            paginationModel.pageSize,
            currentPlot?.plotID,
            currentCensus?.plotCensusNumber,
            currentQuadrat?.quadratID
          )
        : createQFFetchQuery(
            currentSite?.schemaName ?? '',
            gridType,
            pageToFetch,
            paginationModel.pageSize,
            currentPlot?.plotID,
            currentCensus?.plotCensusNumber,
            currentQuadrat?.quadratID
          );
    try {
      const response = await fetch(paginatedQuery, {
        method: quickFilter === '' ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: quickFilter === '' ? undefined : JSON.stringify({ quickFilter: quickFilter })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error fetching data');
      console.log('rows: ', data.output);
      setRows(data.output);
      setRowCount(data.totalCount);

      if (isNewRowAdded && pageToFetch === newLastPage) {
        handleAddNewRow();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setSnackbar({ children: 'Error fetching data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateRow = async (
    gridType: string,
    schemaName: string | undefined,
    newRow: GridRowModel,
    oldRow: GridRowModel,
    setSnackbar: (value: { children: string; severity: 'error' | 'success' }) => void,
    setIsNewRowAdded: (value: boolean) => void,
    setShouldAddRowAfterFetch: (value: boolean) => void,
    fetchPaginatedData: (page: number) => Promise<void>,
    paginationModel: { page: number }
  ): Promise<GridRowModel> => {
    const gridID = getGridID(gridType);
    const fetchProcessQuery =
      gridType !== 'quadrats'
        ? createPostPatchQuery(schemaName ?? '', gridType, gridID)
        : createPostPatchQuery(schemaName ?? '', gridType, gridID, currentPlot?.plotID, currentCensus?.dateRanges[0].censusID);

    try {
      setLoading(true);
      const response = await fetch(fetchProcessQuery, {
        method: oldRow.isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldRow: oldRow, newRow: newRow })
      });

      const responseJSON = await response.json();

      if (!response.ok) {
        throw new Error(responseJSON.message || 'An unknown error occurred');
      }

      setSnackbar({
        children: oldRow.isNew ? 'New row added!' : 'Row updated!',
        severity: 'success'
      });

      if (oldRow.isNew) {
        setIsNewRowAdded(false);
        setShouldAddRowAfterFetch(false);
        await fetchPaginatedData(paginationModel.page);
      }

      return newRow;
    } catch (error: any) {
      setSnackbar({ children: `Error: ${error.message}`, severity: 'error' });
      return Promise.reject(newRow);
    } finally {
      setLoading(false);
    }
  };

  const processRowUpdate = useCallback(
    async (newRow: GridRowModel, oldRow: GridRowModel) => {
      if (newRow?.isNew && !newRow?.id) {
        return oldRow;
      }

      setLoading(true);

      if (newRow.isNew || !newRow.id) {
        setPromiseArguments({
          resolve: async (confirmedRow: GridRowModel) => {
            try {
              const updatedRow = await updateRow(
                gridType,
                currentSite?.schemaName,
                confirmedRow,
                oldRow,
                setSnackbar,
                setIsNewRowAdded,
                setShouldAddRowAfterFetch,
                fetchPaginatedData,
                paginationModel
              );
              setLoading(false);
              return updatedRow;
            } catch (error: any) {
              setLoading(false);
              setSnackbar({ children: `Error: ${error.message}`, severity: 'error' });
              return Promise.reject(error);
            }
          },
          reject: reason => {
            setLoading(false);
            return Promise.reject(reason);
          },
          oldRow,
          newRow
        });

        openConfirmationDialog('save', newRow.id);
        return Promise.reject(new Error('Row update interrupted for new row, awaiting confirmation'));
      }

      try {
        const updatedRow = await updateRow(
          gridType,
          currentSite?.schemaName,
          newRow,
          oldRow,
          setSnackbar,
          setIsNewRowAdded,
          setShouldAddRowAfterFetch,
          fetchPaginatedData,
          paginationModel
        );
        setLoading(false);
        return updatedRow;
      } catch (error: any) {
        setLoading(false);
        setSnackbar({ children: `Error: ${error.message}`, severity: 'error' });
        return Promise.reject(error);
      }
    },
    [gridType, currentSite?.schemaName, setSnackbar, setIsNewRowAdded, setShouldAddRowAfterFetch, fetchPaginatedData, paginationModel]
  );

  const handleRowModesModelChange = useCallback((newRowModesModel: GridRowModesModel) => {
    setRowModesModel(prevModel => {
      const updatedModel = { ...prevModel };
      Object.keys(newRowModesModel).forEach(id => {
        if (updatedModel[id]) {
          updatedModel[id] = {
            ...updatedModel[id],
            ...newRowModesModel[id],
            mode: newRowModesModel[id]?.mode || updatedModel[id]?.mode || GridRowModes.View
          };
        } else {
          console.warn(`Row ID ${id} does not exist in rowModesModel. Skipping.`);
        }
      });
      return updatedModel;
    });
  }, []);

  const handleCloseSnackbar = useCallback(() => setSnackbar(null), []);

  const handleRowEditStop = useCallback<GridEventListener<'rowEditStop'>>((params, event) => {
    if (params.reason === GridRowEditStopReasons.rowFocusOut) {
      event.defaultMuiPrevented = true;
    }
  }, []);

  const handleEditClick = useCallback(
    (id: GridRowId) => () => {
      if (locked) return;
      setRowModesModel(prevModel => ({
        ...prevModel,
        [id]: { mode: GridRowModes.Edit }
      }));
      setTimeout(() => {
        const firstEditableColumn = filteredColumns.find(col => col.editable);
        if (firstEditableColumn) {
          apiRef.current.setCellFocus(id, firstEditableColumn.field);
        }
      });
    },
    [locked, apiRef]
  );

  const handleCancelClick = useCallback(
    (id: GridRowId, event?: React.MouseEvent | React.KeyboardEvent) => {
      if (locked) return;
      event?.preventDefault();

      const row = rows.find(row => String(row.id) === String(id));

      if (row?.isNew) {
        setRows(oldRows => oldRows.filter(row => row.id !== id));

        setRowModesModel(prevModel => {
          const updatedModel = { ...prevModel };
          delete updatedModel[id];
          return updatedModel;
        });

        setIsNewRowAdded(false);
      } else {
        setRowModesModel(prevModel => ({
          ...prevModel,
          [id]: { mode: GridRowModes.View, ignoreModifications: true }
        }));
      }
    },
    [locked, rows]
  );

  function onQuickFilterChange(value: string) {
    setQuickFilter(value);
  }

  function runQuickFilter() {}

  const getEnhancedCellAction = useCallback(
    (type: string, icon: any, onClick: any) => (
      <CellItemContainer>
        <Tooltip
          disableInteractive
          title={
            type === 'Save'
              ? `Save your changes`
              : type === 'Cancel'
                ? `Cancel your changes`
                : type === 'Edit'
                  ? `Edit this row`
                  : type === 'Delete'
                    ? 'Delete this row (cannot be undone!)'
                    : type === 'Limits'
                      ? 'View limits for this row'
                      : undefined
          }
          arrow
          placement="top"
        >
          <GridActionsCellItem icon={icon} label={type} onClick={onClick} />
        </Tooltip>
      </CellItemContainer>
    ),
    []
  );

  const getGridActionsColumn = useCallback(
    (): GridColDef => ({
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      flex: 1,
      cellClassName: 'actions',
      getActions: ({ id }) => {
        if (!rowModesModel[id]?.mode) return [];
        const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;
        if (isInEditMode && !locked) {
          return [
            getEnhancedCellAction('Save', <SaveIcon />, handleSaveClick(id)),
            getEnhancedCellAction('Cancel', <CancelIcon />, (e: any) => handleCancelClick(id, e))
          ];
        }
        return [getEnhancedCellAction('Edit', <EditIcon />, handleEditClick(id)), getEnhancedCellAction('Delete', <DeleteIcon />, handleDeleteClick(id))];
      }
    }),
    [rowModesModel, locked]
  );

  const columns = useMemo(() => {
    return [...applyFilterToColumns(gridColumns), getGridActionsColumn()];
  }, [gridColumns, rowModesModel, getGridActionsColumn]);

  const filteredColumns = useMemo(() => (gridType !== 'quadratpersonnel' ? filterColumns(rows, columns) : columns), [rows, columns]);

  const handleCellDoubleClick: GridEventListener<'cellDoubleClick'> = params => {
    if (locked) return;
    setRowModesModel(prevModel => ({
      ...prevModel,
      [params.id]: { mode: GridRowModes.Edit }
    }));
  };

  const handleCellKeyDown: GridEventListener<'cellKeyDown'> = (params, event) => {
    if (event.key === 'Enter' && !locked) {
      event.defaultMuiPrevented = true;
    }
    if (event.key === 'Escape') {
      event.defaultMuiPrevented = true;
    }
  };

  if (!currentSite || !currentPlot || !currentCensus) {
    redirect('/dashboard');
  } else {
    return (
      <Box
        sx={{
          width: '100%',
          '& .actions': {
            color: 'text.secondary'
          },
          '& .textPrimary': {
            color: 'text.primary'
          }
        }}
      >
        <Box sx={{ width: '100%', flexDirection: 'column' }}>
          <Typography level={'title-lg'}>Note: The Grid is filtered by your selected Plot and Plot ID</Typography>
          <StyledDataGrid
            apiRef={apiRef}
            sx={{ width: '100%' }}
            rows={rows}
            columns={columns}
            editMode="row"
            rowModesModel={rowModesModel}
            disableColumnSelector
            onRowModesModelChange={handleRowModesModelChange}
            onRowEditStop={handleRowEditStop}
            onCellDoubleClick={handleCellDoubleClick}
            onCellKeyDown={handleCellKeyDown}
            processRowUpdate={async (newRow, oldRow) => {
              // Create a promise to wait for state updates
              const waitForStateUpdates = async () => {
                return new Promise<void>(resolve => {
                  const checkUpdates = () => {
                    if (rows.length > 0 && Object.keys(rowModesModel).length > 0) {
                      resolve(); // Resolve when states are updated
                    } else {
                      setTimeout(checkUpdates, 50); // Retry every 50ms
                    }
                  };
                  checkUpdates();
                });
              };

              // Wait for rows and rowModesModel to update
              await waitForStateUpdates();

              // Now call the actual processRowUpdate logic after the state has settled
              try {
                return await processRowUpdate(newRow, oldRow);
              } catch (error) {
                console.error('Error processing row update:', error);
                setSnackbar({ children: 'Error updating row', severity: 'error' });
                return Promise.reject(error); // Handle error if needed
              }
            }}
            onProcessRowUpdateError={error => {
              console.error('Row update error:', error);
              setSnackbar({
                children: 'Error updating row',
                severity: 'error'
              });
            }}
            loading={refresh || loading}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            paginationModel={paginationModel}
            rowCount={rowCount}
            pageSizeOptions={[paginationModel.pageSize]}
            filterModel={filterModel}
            onFilterModelChange={newFilterModel => setFilterModel(newFilterModel)}
            initialState={{
              columns: {
                columnVisibilityModel: getColumnVisibilityModel(gridType)
              }
            }}
            slots={{
              toolbar: EditToolbar
            }}
            slotProps={{
              toolbar: {
                locked: locked,
                handleAddNewRow: handleAddNewRow,
                handleRefresh: handleRefresh,
                handleExportAll: fetchFullData,
                handleExportCSV: exportAllCSV,
                handleQuickFilterChange: onQuickFilterChange,
                filterModel: filterModel
              }
            }}
            getRowHeight={() => 'auto'}
          />
        </Box>
        {!!snackbar && (
          <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} onClose={handleCloseSnackbar} autoHideDuration={6000}>
            <Alert {...snackbar} onClose={handleCloseSnackbar} />
          </Snackbar>
        )}
        {isDialogOpen && promiseArguments && (
          <SkipReEnterDataModal
            gridType={gridType}
            row={promiseArguments.newRow} // Pass the newRow directly
            handleClose={handleCancelAction}
            handleSave={handleConfirmAction}
          />
        )}
        {isDeleteDialogOpen && (
          <ConfirmationDialog
            open={isDeleteDialogOpen}
            onClose={handleCancelAction}
            onConfirm={handleConfirmAction}
            title="Confirm Deletion"
            content="Are you sure you want to delete this row? This action cannot be undone."
          />
        )}
      </Box>
    );
  }
}
