import React from 'react';

const AnalyzingScreen = () => {
  return <div>Analyzing...</div>;
};

const ResultPanel = () => {
  return <div>Results will be displayed here.</div>;
};

const UploadStep = () => {
  return <div>Upload your file here.</div>;
};

const AnalyzeView = () => {
  return (
    <div>
      <UploadStep />
      <AnalyzingScreen />
      <ResultPanel />
    </div>
  );
};

export default AnalyzeView;