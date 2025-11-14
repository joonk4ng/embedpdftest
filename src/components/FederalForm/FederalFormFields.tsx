import React from 'react';
import { FormSection, FormRow } from './FormSection';
import {
  AgreementNumberField,
  ContractorAgencyField,
  ResourceOrderNumberField,
  IncidentNameField,
  IncidentNumberField,
  FinancialCodeField,
  EquipmentMakeModelField,
  EquipmentTypeField,
  SerialVinNumberField,
  LicenseIdNumberField,
  TransportRetainedField,
  IsFirstLastTicketField,
  RateTypeField,
  AgencyRepresentativeField,
  IncidentSupervisorField
} from './FormFieldDefinitions';
import type { FederalFormData } from '../../utils/engineTimeDB';

interface FederalFormFieldsProps {
  formData: FederalFormData;
  onChange: (field: keyof FederalFormData, value: string) => void;
}

export const FederalFormFields: React.FC<FederalFormFieldsProps> = ({
  formData,
  onChange
}) => {
  return (
    <>
      {/* Basic Information Section */}
      <FormSection title="Basic Information">
        <FormRow columns={2}>
          <AgreementNumberField
            value={formData.agreementNumber}
            onChange={onChange}
          />
          <ContractorAgencyField
            value={formData.contractorAgencyName}
            onChange={onChange}
          />
        </FormRow>

        <FormRow columns={2}>
          <ResourceOrderNumberField
            value={formData.resourceOrderNumber}
            onChange={onChange}
          />
          <IncidentNameField
            value={formData.incidentName}
            onChange={onChange}
          />
        </FormRow>

        <IncidentNumberField
          value={formData.incidentNumber}
          onChange={onChange}
        />

        <FinancialCodeField
          value={formData.financialCode}
          onChange={onChange}
        />
      </FormSection>

      {/* Equipment Information Section */}
      <FormSection title="Equipment Information">
        <FormRow columns={2}>
          <EquipmentMakeModelField
            value={formData.equipmentMakeModel}
            onChange={onChange}
          />
          <EquipmentTypeField
            value={formData.equipmentType}
            onChange={onChange}
          />
        </FormRow>

        <FormRow columns={2}>
          <SerialVinNumberField
            value={formData.serialVinNumber}
            onChange={onChange}
          />
          <LicenseIdNumberField
            value={formData.licenseIdNumber}
            onChange={onChange}
          />
        </FormRow>

        <TransportRetainedField
          value={formData.transportRetained}
          onChange={onChange}
        />

        <IsFirstLastTicketField
          value={formData.isFirstLastTicket}
          onChange={onChange}
        />

        <RateTypeField
          value={formData.rateType}
          onChange={onChange}
        />

        <AgencyRepresentativeField
          value={formData.agencyRepresentative}
          onChange={onChange}
        />

        <IncidentSupervisorField
          value={formData.incidentSupervisor}
          onChange={onChange}
        />
      </FormSection>
    </>
  );
};

