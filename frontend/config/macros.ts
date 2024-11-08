/**
 * Interface and type definitions for the ForestGEO upload system.
 *
 * This file defines types used throughout the upload system components to define props, state, contexts etc. It also defines some utility functions used in the upload flow.
 */
import { FileRejection, FileWithPath } from 'react-dropzone';
import '@/styles/customtablesettings.css';
import ConnectionManager from '@/config/connectionmanager';
import { FileRow } from '@/config/macros/formdetails';
import { processPersonnel } from '@/components/processors/processpersonnel';
import { processSpecies } from '@/components/processors/processspecies';
import { processQuadrats } from '@/components/processors/processquadrats';
import { processCensus } from '@/components/processors/processcensus';

export type ColumnStates = {
  [key: string]: boolean;
};

export type ValidationErrorID = number;

export enum HTTPResponses {
  OK = 200,
  CREATED = 201,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  SQL_CONNECTION_FAILURE = 408, // Custom code, example
  INVALID_REQUEST = 400,
  PRECONDITION_VALIDATION_FAILURE = 412,
  FOREIGN_KEY_CONFLICT = 555,
  NOT_FOUND // Custom code, example
}

export enum ErrorMessages {
  SCF = 'SQL Command Failure',
  ICF = 'Insertion Command Failed',
  UCF = 'Update Command Failed',
  DCF = 'Delete Command Failed',
  UKAE = 'Unique Key Already Exists'
}

export const tableHeaderSettings = {
  fontWeight: 'bold',
  fontSize: 16
};

export interface DropzonePureProps {
  /** Is someone dragging file(s) onto the dropzone? */
  isDragActive: boolean;
  /** From react-dropzone, function which gets  for putting attributes */
  getRootProps: any;
  /** From react-dropzone, function which gets attributes for the input field. */
  getInputProps: any;
}

// conditional CSS logic saved here for future usage
// const columns: GridColDef[] = [
//   {
//     field: 'name',
//     cellClassName: 'super-app-theme--cell',
//   },
//   {
//     field: 'score',
//     type: 'number',
//     width: 140,
//     cellClassName: (params: GridCellParams<any, number>) => {
//       if (params.value == null) {
//         return '';
//       }
//
//       return clsx('super-app', {
//         negative: params.value < 0,
//         positive: params.value > 0,
//       });
//     },
//   },
// ];

export interface DropzoneProps {
  /**
   * A callback function which is called when files given for upload.
   * Files can be given by the user either by dropping the files
   * with drag and drop, or by using the file viewfiles button.
   *
   * @param acceptedFiles - files which were accepted for upload.
   * @param rejectedFiles - files which are denied uploading.
   */
  onChange(acceptedFiles: FileWithPath[], rejectedFiles: FileRejection[]): void;
}

export function bitToBoolean(bitField: any): boolean {
  if (Buffer.isBuffer(bitField)) {
    // Ensure non-zero bytes are considered `true`
    return bitField[0] !== 0;
  } else if (bitField instanceof Uint8Array) {
    return bitField[0] !== 0;
  } else {
    return Boolean(bitField);
  }
}

export const booleanToBit = (value: boolean | undefined): number => (value ? 1 : 0);
export type UnitSelection = 'km' | 'hm' | 'dam' | 'm' | 'dm' | 'cm' | 'mm';
export type AreaSelection = 'km2' | 'hm2' | 'dam2' | 'm2' | 'dm2' | 'cm2' | 'mm2';

export const unitSelectionOptions: UnitSelection[] = ['km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm'];
export const areaSelectionOptions: AreaSelection[] = ['km2', 'hm2', 'dam2', 'm2', 'dm2', 'cm2', 'mm2'];
export type UnifiedValidityFlags = {
  attributes: boolean;
  personnel: boolean;
  species: boolean;
  quadrats: boolean;
  quadratpersonnel: boolean;
};

export type GridSelections = {
  label: string;
  value: number;
};

export type UserAuthRoles = 'global' | 'db admin' | 'lead technician' | 'field crew';

export interface SpecialProcessingProps {
  connectionManager: ConnectionManager;
  rowData: FileRow;
  schema: string;
  plotID?: number;
  censusID?: number;
  quadratID?: number;
  fullName?: string;
}

export interface InsertUpdateProcessingProps extends SpecialProcessingProps {
  formType: string;
}

export type FileMapping = {
  tableName: string;
  columnMappings: { [fileColumn: string]: string };
  specialProcessing?: (props: Readonly<SpecialProcessingProps>) => Promise<number | undefined>;
};
// Define the mappings for each file type
export const fileMappings: Record<string, FileMapping> = {
  attributes: {
    tableName: 'Attributes',
    columnMappings: {
      code: 'Code',
      description: 'Description',
      status: 'Status'
    }
  },
  personnel: {
    tableName: 'Personnel',
    columnMappings: {
      firstname: 'FirstName',
      lastname: 'LastName',
      role: 'Role'
    },
    specialProcessing: processPersonnel
  },
  species: {
    tableName: '',
    columnMappings: {
      spcode: 'Species.SpeciesCode',
      family: 'Family.Family',
      genus: 'Genus.GenusName',
      species: 'Species.SpeciesName',
      subspecies: 'Species.SubspeciesName', // optional
      IDLevel: 'Species.IDLevel',
      authority: 'Species.Authority',
      subauthority: 'Species.SubspeciesAuthority' // optional
    },
    specialProcessing: processSpecies
  },
  quadrats: {
    tableName: 'quadrats',
    // "quadrats": [{label: "quadrat"}, {label: "startx"}, {label: "starty"}, {label: "dimx"}, {label: "dimy"}, {label: "unit"}, {label: "quadratshape"}],
    columnMappings: {
      quadrat: 'QuadratName',
      plotID: 'PlotID',
      startx: 'StartX',
      starty: 'StartY',
      coordinateunit: 'CoordinateUnits',
      dimx: 'DimensionX',
      dimy: 'DimensionY',
      dimensionunit: 'DimensionUnits',
      quadratshape: 'QuadratShape'
    },
    specialProcessing: processQuadrats
  },
  // "subquadrats": "subquadrat, quadrat, dimx, dimy, xindex, yindex, unit, orderindex",
  subquadrats: {
    tableName: 'subquadrats',
    columnMappings: {
      subquadrat: 'SubquadratName',
      quadrat: 'QuadratID',
      plotID: 'PlotID',
      censusID: 'CensusID',
      dimx: 'DimensionX',
      dimy: 'DimensionY',
      xindex: 'X',
      yindex: 'Y',
      unit: 'Unit',
      orderindex: 'Ordering'
    }
  },
  measurements: {
    tableName: '', // Multiple tables involved
    columnMappings: {},
    specialProcessing: processCensus
  }
};
export type ValidationResponse = {
  totalRows: number;
  failedRows: number;
  message: string;
  failedCoreMeasurementIDs?: number[];
};
