// EEST Field Debugger Component - Helps troubleshoot field mapping issues
import React, { useState } from 'react';
import { EmbedPDFViewer } from './EmbedPDFViewer';
import { testEESTPDFPopulation } from '../../utils/PDF/eestSaveHandler';
import { type EESTFormData, type EESTTimeEntry, FormType } from '../../utils/engineTimeDB';
import { mapEESTToPDFFields } from '../../utils/fieldmapper/eestFieldMapper';
import { getPDF } from '../../utils/pdfStorage';
import * as pdfjsLib from 'pdfjs-dist';
import { debugEESTDatabase, testEESTDataPersistence, logEESTDatabaseState } from '../../utils/eestDBDebug';
import { extractEESTFieldNames, compareEESTFieldMapping, logEESTFieldInfo } from '../../utils/eestFieldExtractor';

export const EESTFieldDebugger: React.FC = () => {
  const [debugOutput, setDebugOutput] = useState<string>('');
  const [isDebugging, setIsDebugging] = useState(false);

  // Test form data
  const testFormData: EESTFormData = {
    formType: FormType.EEST,
    agreementNumber: 'AG-2024-001',
    resourceOrderNumber: 'RO-2024-001',
    contractorAgencyName: 'Test Contracting Co.',
    incidentName: 'Test Fire Incident',
    incidentNumber: 'FIRE-2024-001',
    operatorName: 'John Doe',
    equipmentMake: 'Caterpillar',
    equipmentModel: 'D6T',
    serialNumber: 'CAT123456789',
    licenseNumber: 'LIC789',
    equipmentStatus: 'Contractor',
    invoicePostedBy: 'JD',
    dateSigned: '2024-01-15',
    remarks: 'Test equipment in good condition',
    remarksOptions: ['HOTLINE', 'Self Sufficient - No Meals Provided'],
    customRemarks: ['Custom test remark']
  };

  // Test time entries
  const testTimeEntries: EESTTimeEntry[] = [
    {
      id: 1,
      date: '2024-01-15',
      start: '0800',
      stop: '1700',
      work: '9.0',
      special: 'None'
    },
    {
      id: 2,
      date: '2024-01-16',
      start: '0800',
      stop: '1600',
      work: '8.0',
      special: 'Travel'
    }
  ];

  const testFieldMapping = () => {
    setIsDebugging(true);
    setDebugOutput('Testing field mapping...\n\n');
    
    try {
      // Test the field mapping
      const mappedFields = mapEESTToPDFFields(testFormData, testTimeEntries);
      
      let output = '🔍 EEST Field Mapping Test Results:\n\n';
      output += '📋 Input Form Data:\n';
      output += JSON.stringify(testFormData, null, 2);
      output += '\n\n📋 Input Time Entries:\n';
      output += JSON.stringify(testTimeEntries, null, 2);
      output += '\n\n📋 Mapped PDF Fields:\n';
      
      Object.entries(mappedFields).forEach(([fieldName, value]) => {
        output += `- ${fieldName}: "${value}"\n`;
      });
      
      output += `\n📊 Summary: ${Object.keys(mappedFields).length} fields mapped\n`;
      
      setDebugOutput(output);
    } catch (error) {
      setDebugOutput(`❌ Error testing field mapping: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const clearDebugOutput = () => {
    setDebugOutput('');
  };

  const debugDatabase = async () => {
    setIsDebugging(true);
    setDebugOutput('Debugging EEST database...\n\n');
    
    try {
      // Log database state to console
      await logEESTDatabaseState();
      
      // Get debug info
      const debugInfo = await debugEESTDatabase();
      
      let output = '🔍 EEST Database Debug Results:\n\n';
      output += `📊 Database: ${debugInfo.databaseName} (v${debugInfo.databaseVersion})\n`;
      output += `📋 Form Data: ${debugInfo.formDataExists ? 'EXISTS' : 'NOT FOUND'}\n`;
      output += `⏰ Time Entries: ${debugInfo.timeEntriesCount} entries\n\n`;
      
      if (debugInfo.formData) {
        output += '📋 Form Data Details:\n';
        output += JSON.stringify(debugInfo.formData, null, 2);
        output += '\n\n';
      }
      
      if (debugInfo.timeEntries.length > 0) {
        output += '⏰ Time Entries Details:\n';
        output += JSON.stringify(debugInfo.timeEntries, null, 2);
        output += '\n\n';
      }
      
      output += '🔍 Check browser console for detailed database logs\n';
      
      setDebugOutput(output);
      
    } catch (error) {
      setDebugOutput(prev => prev + `❌ Error debugging database: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const testDataPersistence = async () => {
    setIsDebugging(true);
    setDebugOutput('Testing EEST data persistence...\n\n');
    
    try {
      const success = await testEESTDataPersistence();
      
      if (success) {
        setDebugOutput(prev => prev + '✅ Data persistence test PASSED\n');
        setDebugOutput(prev => prev + '🔍 EEST database is working correctly\n');
      } else {
        setDebugOutput(prev => prev + '❌ Data persistence test FAILED\n');
        setDebugOutput(prev => prev + '🔍 Check browser console for details\n');
      }
      
    } catch (error) {
      setDebugOutput(prev => prev + `❌ Error testing data persistence: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const extractFieldNames = async () => {
    setIsDebugging(true);
    setDebugOutput('Extracting EEST PDF field names...\n\n');
    
    try {
      // Log field info to console
      await logEESTFieldInfo();
      
      // Get field names
      const fieldInfo = await extractEESTFieldNames();
      
      let output = '🔍 EEST PDF Field Names:\n\n';
      output += `📊 Total Fields: ${fieldInfo.length}\n\n`;
      
      fieldInfo.forEach((field, index) => {
        output += `${index + 1}. "${field.name}" (${field.type})${field.value ? ` = "${field.value}"` : ''}\n`;
      });
      
      output += '\n🔍 Check browser console for detailed field comparison\n';
      
      setDebugOutput(output);
      
    } catch (error) {
      setDebugOutput(prev => prev + `❌ Error extracting field names: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const compareFieldMapping = async () => {
    setIsDebugging(true);
    setDebugOutput('Comparing EEST field mapping...\n\n');
    
    try {
      // Log field comparison to console
      await logEESTFieldInfo();
      
      // Get comparison results
      const comparison = await compareEESTFieldMapping();
      
      let output = '🔍 EEST Field Mapping Comparison:\n\n';
      output += `📊 Mapped Fields: ${comparison.mappedFields.length}\n`;
      output += `📊 Actual Fields: ${comparison.actualFields.length}\n`;
      output += `✅ Matches: ${comparison.matches.length}\n`;
      output += `❌ Mismatches: ${comparison.mismatches.length}\n\n`;
      
      if (comparison.mismatches.length > 0) {
        output += '❌ Mismatched Fields:\n';
        comparison.mismatches.forEach(field => {
          output += `- "${field}"\n`;
        });
        output += '\n';
      }
      
      if (comparison.matches.length > 0) {
        output += '✅ Matched Fields:\n';
        comparison.matches.forEach(field => {
          output += `- "${field}"\n`;
        });
        output += '\n';
      }
      
      output += '🔍 Check browser console for detailed field information\n';
      
      setDebugOutput(output);
      
    } catch (error) {
      setDebugOutput(prev => prev + `❌ Error comparing field mapping: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const testPDFPopulation = async () => {
    setIsDebugging(true);
    setDebugOutput('Testing PDF population...\n\n');
    
    try {
      // Get the EEST PDF
      const storedPDF = await getPDF('eest-form');
      if (!storedPDF) {
        setDebugOutput('❌ EEST PDF not found in storage\n');
        return;
      }

      // Load the PDF document
      const arrayBuffer = await storedPDF.pdf.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true,
        disableFontFace: false,
        disableRange: false,
        disableStream: false
      });
      
      const pdfDoc = await loadingTask.promise;
      
      // Test PDF population
      const populatedPDFBlob = await testEESTPDFPopulation(pdfDoc, testFormData, testTimeEntries);
      
      // Create download link
      const url = URL.createObjectURL(populatedPDFBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'test-populated-eest.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setDebugOutput(prev => prev + '✅ PDF population test completed successfully!\n');
      setDebugOutput(prev => prev + '📄 Populated PDF downloaded as "test-populated-eest.pdf"\n');
      setDebugOutput(prev => prev + '🔍 Check browser console for detailed field mapping logs\n');
      
    } catch (error) {
      setDebugOutput(prev => prev + `❌ Error testing PDF population: ${error}\n`);
    } finally {
      setIsDebugging(false);
    }
  };

  const handleSave = (_pdfData: Blob, _previewImage: Blob) => {
    console.log('🔍 EEST Field Debugger: PDF saved with debugging info');
    console.log('🔍 Check browser console for detailed field mapping logs');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🔍 EEST Field Mapping Debugger</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testFieldMapping}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Testing...' : 'Test Field Mapping'}
        </button>
        
        <button 
          onClick={testPDFPopulation}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Testing...' : 'Test PDF Population'}
        </button>
        
        <button 
          onClick={debugDatabase}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Debugging...' : 'Debug Database'}
        </button>
        
        <button 
          onClick={testDataPersistence}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#ffc107',
            color: 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Testing...' : 'Test Data Persistence'}
        </button>
        
        <button 
          onClick={extractFieldNames}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#6f42c1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Extracting...' : 'Extract Field Names'}
        </button>
        
        <button 
          onClick={compareFieldMapping}
          disabled={isDebugging}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#e83e8c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isDebugging ? 'not-allowed' : 'pointer'
          }}
        >
          {isDebugging ? 'Comparing...' : 'Compare Field Mapping'}
        </button>
        
        <button 
          onClick={clearDebugOutput}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Clear Output
        </button>
      </div>

      {debugOutput && (
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          padding: '15px',
          marginBottom: '20px',
          whiteSpace: 'pre-wrap',
          fontSize: '12px',
          maxHeight: '400px',
          overflow: 'auto'
        }}>
          {debugOutput}
        </div>
      )}

      <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }}>
        <h3>EEST PDF Viewer (with debugging enabled):</h3>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Open browser console to see detailed field mapping logs when saving
        </p>
        <EmbedPDFViewer
          pdfId="eest-form"
          onSave={handleSave}
          style={{ maxWidth: '100%' }}
        />
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
        <h4>🔍 Debugging Instructions:</h4>
        <ol style={{ fontSize: '14px' }}>
          <li>Click "Extract Field Names" to see all actual field names in the EEST PDF</li>
          <li>Click "Compare Field Mapping" to see which field names match/don't match</li>
          <li>Click "Debug Database" to check if EEST data is being saved to IndexedDB</li>
          <li>Click "Test Data Persistence" to verify database operations work correctly</li>
          <li>Click "Test Field Mapping" to see what fields are being mapped</li>
          <li>Click "Test PDF Population" to download a populated PDF for testing</li>
          <li>Open browser console (F12) to see detailed logs</li>
          <li>Try saving the PDF to see field population in action</li>
          <li>Look for ✅ (success) and ❌ (error) indicators in console</li>
          <li>Check if field names match exactly with your PDF</li>
          <li>Compare the downloaded test PDF with your original to see what's populated</li>
        </ol>
      </div>
    </div>
  );
};

export default EESTFieldDebugger;
