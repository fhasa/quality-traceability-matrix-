import React, { useState } from 'react';
import { Play } from 'lucide-react';
import CoverageIndicator from './CoverageIndicator';
import TestExecutionModal from '../TestExecution/TestExecutionModal';

const RequirementRow = ({ req, coverage, mapping, testCases, expanded, onToggleExpand, selectedVersion }) => {
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  
  // Get all mapped test cases for this requirement
  const allMappedTests = mapping[req.id] || [];
  
  // Filter test cases based on the selected version
  const mappedTests = selectedVersion === 'unassigned' 
    ? allMappedTests
    : allMappedTests.filter(tcId => {
        const tc = testCases.find(t => t.id === tcId);
        return tc && (!tc.version || tc.version === selectedVersion || tc.version === '');
      });
  
  // Get the actual test case objects
  const mappedTestObjects = mappedTests.map(tcId => 
    testCases.find(tc => tc.id === tcId)
  ).filter(Boolean);
  
  // Count test cases by execution status
  const passedCount = mappedTests.filter(tcId => {
    const tc = testCases.find(tc => tc.id === tcId);
    return tc && tc.status === 'Passed';
  }).length;
  
  const failedCount = mappedTests.filter(tcId => {
    const tc = testCases.find(tc => tc.id === tcId);
    return tc && tc.status === 'Failed';
  }).length;
  
  // Count tests that have execution status (passed or failed)
  const executedCount = passedCount + failedCount;
  
  // All tests that don't have a definitive execution result are considered "Not Run"
  const notRunCount = mappedTests.length - executedCount;

  // Calculate coverage percentage
  const coveragePercentage = coverage ? coverage.coverageRatio : 0;
  
  // Handle test completion
  const handleTestComplete = (results) => {
    // In a real application, this would update the test case statuses in your data store
    console.log(`Test execution completed for ${req.id}:`, results);
    
    // Close the modal after a short delay
    setTimeout(() => {
      setIsTestModalOpen(false);
    }, 2000);
  };

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="border p-2">
          <button 
            onClick={onToggleExpand}
            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200"
          >
            {expanded ? '−' : '+'}
          </button>
        </td>
        <td className="border p-2 font-medium">{req.id}</td>
        <td className="border p-2">{req.name}</td>
        <td className="border p-2 text-center">
          <span className={`px-2 py-1 rounded text-xs ${
            req.priority === 'High' ? 'bg-red-100 text-red-800' : 
            req.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {req.priority}
          </span>
        </td>
        
        {/* Test Coverage column */}
        <td className="border p-2 text-center">
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-500">{mappedTests.length}/{req.minTestCases} tests</span>
            <div className={`mt-1 w-4 h-4 rounded-full flex items-center justify-center ${
              mappedTests.length >= req.minTestCases 
                ? 'bg-green-500 text-white' 
                : 'bg-orange-500 text-white'
            }`}>
              {mappedTests.length >= req.minTestCases ? '✓' : '!'}
            </div>
            
            {/* Coverage percentage displayed here */}
            {coverage && (
              <div className={`text-xs font-medium mt-1 ${
                coverage.meetsMinimum 
                  ? 'text-green-600' 
                  : 'text-orange-600'
              }`}>
                {coveragePercentage}% coverage
              </div>
            )}
          </div>
        </td>
        
        <td className="border p-2">
          <div className="flex gap-2 items-center justify-center">
            {/* Only show passed tests if there are any */}
            {passedCount > 0 && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">{passedCount} Passed</span>
            )}
            
            {/* Only show failed tests if there are any */}
            {failedCount > 0 && (
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">{failedCount} Failed</span>
            )}
            
            {/* Show all tests without execution status as Not Run */}
            {notRunCount > 0 && (
              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">{notRunCount} Not Run</span>
            )}
            
            {/* Show a message when there are no tests */}
            {mappedTests.length === 0 && (
              <span className="text-gray-500 text-xs">No tests linked</span>
            )}
          </div>
        </td>
        
        {/* Coverage column - Only showing Pass Rate and Automation Rate */}
        <td className="border p-2">
          {coverage ? (
            <div className="flex flex-col">
              <div className="text-xs mb-1">Pass: {coverage.passPercentage}%</div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                <div 
                  className="bg-green-600 h-1.5 rounded-full" 
                  style={{width: `${coverage.passPercentage}%`}}
                ></div>
              </div>
              
              <div className="text-xs mb-1">Auto: {coverage.automationPercentage}%</div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full" 
                  style={{width: `${coverage.automationPercentage}%`}}
                ></div>
              </div>
            </div>
          ) : (
            <span className="text-red-500 text-xs">No Coverage</span>
          )}
        </td>
        
        {/* Add new column for actions */}
        <td className="border p-2 text-center">
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs"
            disabled={mappedTests.length === 0}
            title={mappedTests.length === 0 ? "No test cases to run" : "Run tests for this requirement"}
          >
            <Play className="mr-1" size={12} />
            Run Tests
          </button>
        </td>
      </tr>
      
      {expanded && (
        <tr>
          <td colSpan="8" className="border p-0">
            <div className="p-3 bg-gray-50">
              <h4 className="font-medium mb-2">Test Cases for {req.id}: {req.name}</h4>
              {mappedTests.length === 0 ? (
                <p className="text-gray-500 italic">No test cases associated with this requirement for the selected version.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-1">Test ID</th>
                      <th className="border p-1">Name</th>
                      <th className="border p-1">Status</th>
                      <th className="border p-1">Automation</th>
                      <th className="border p-1">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedTests.map(tcId => {
                      const tc = testCases.find(t => t.id === tcId);
                      return tc ? (
                        <tr key={tc.id}>
                          <td className="border p-1">{tc.id}</td>
                          <td className="border p-1">{tc.name}</td>
                          <td className="border p-1">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                              tc.status === 'Passed' ? 'bg-green-100 text-green-800' : 
                              tc.status === 'Failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {tc.status}
                            </span>
                          </td>
                          <td className="border p-1">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                              tc.automationStatus === 'Automated' ? 'bg-blue-100 text-blue-800' : 
                              tc.automationStatus === 'Planned' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {tc.automationStatus}
                            </span>
                          </td>
                          <td className="border p-1">
                            <span className="text-xs">
                              {tc.version || 'All Versions'}
                            </span>
                          </td>
                        </tr>
                      ) : null;
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
      
      {/* Test Execution Modal */}
      <TestExecutionModal
        requirement={req}
        testCases={mappedTestObjects}
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        onTestComplete={handleTestComplete}
      />
    </>
  );
};

export default RequirementRow;