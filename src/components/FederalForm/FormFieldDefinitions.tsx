import React from 'react';
import { FormField } from './FormField';
import type { FederalFormData } from '../../utils/engineTimeDB';

interface FieldProps {
  value: string;
  onChange: (field: keyof FederalFormData, value: string) => void;
}

// Basic Information Fields

export const AgreementNumberField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="1. Agreement Number"
    value={value}
    onChange={(val) => onChange('agreementNumber', val)}
    placeholder="Enter agreement number"
  />
);

export const ContractorAgencyField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="2. Contractor/Agency Name"
    value={value}
    onChange={(val) => onChange('contractorAgencyName', val)}
    placeholder="Enter contractor/agency name"
  />
);

export const ResourceOrderNumberField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="3. E-Number"
    value={value}
    onChange={(val) => onChange('resourceOrderNumber', val)}
    placeholder="Enter resource order number"
  />
);

export const IncidentNameField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="4. Incident Name"
    value={value}
    onChange={(val) => onChange('incidentName', val)}
    placeholder="Enter incident name"
  />
);

export const IncidentNumberField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="5. Incident Number"
    value={value}
    onChange={(val) => onChange('incidentNumber', val)}
    placeholder="Enter incident number"
  />
);

export const FinancialCodeField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="6. Financial Code"
    value={value}
    onChange={(val) => onChange('financialCode', val)}
    placeholder="Enter financial code"
    hidden={true}
  />
);

// Equipment Information Fields

export const EquipmentMakeModelField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="7. Equipment Model"
    value={value}
    onChange={(val) => onChange('equipmentMakeModel', val)}
    placeholder="Enter make/model"
  />
);

export const EquipmentTypeField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="8. Equipment Type"
    value={value}
    onChange={(val) => onChange('equipmentType', val)}
    placeholder="Enter equipment type"
  />
);

export const SerialVinNumberField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="9. VIN Number"
    value={value}
    onChange={(val) => onChange('serialVinNumber', val)}
    placeholder="Enter serial/VIN"
  />
);

export const LicenseIdNumberField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="10. License Plate"
    value={value}
    onChange={(val) => onChange('licenseIdNumber', val)}
    placeholder="Enter license/ID"
  />
);

export const TransportRetainedField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="12. Transport Retained?"
    value={value}
    onChange={(val) => onChange('transportRetained', val)}
    type="select"
    options={[
      { value: '', label: 'Select...' },
      { value: 'YES', label: 'Yes' },
      { value: 'NO', label: 'No' }
    ]}
    hidden={true}
  />
);

export const IsFirstLastTicketField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="13. First/Last Ticket?"
    value={value}
    onChange={(val) => onChange('isFirstLastTicket', val)}
    type="select"
    options={[
      { value: 'Neither', label: 'Neither' },
      { value: 'Mobilization', label: 'Mobilization' },
      { value: 'Demobilization', label: 'Demobilization' }
    ]}
    hidden={true}
  />
);

export const RateTypeField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="14. Rate Type"
    value={value}
    onChange={(val) => onChange('rateType', val)}
    type="select"
    options={[
      { value: 'HOURS', label: 'Hours' }
    ]}
    hidden={true}
  />
);

export const AgencyRepresentativeField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="31. Contractor/Agency Representative"
    value={value}
    onChange={(val) => onChange('agencyRepresentative', val)}
    placeholder="Enter agency representative name"
    hidden={true}
  />
);

export const IncidentSupervisorField: React.FC<FieldProps> = ({ value, onChange }) => (
  <FormField
    label="33. Incident Supervisor"
    value={value}
    onChange={(val) => onChange('incidentSupervisor', val)}
    placeholder="Enter incident supervisor name"
  />
);

