const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/components/**/*.tsx');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace (e, data) with (_, data)
  content = content.replace(/\(e, data\)/g, '(_, data)');
  
  // Replace color="neutral" with color="subtle"
  content = content.replace(/color="neutral"/g, 'color="subtle"');
  
  // Replace "neutral" strings returned by functions (for Badge)
  content = content.replace(/return "neutral"/g, 'return "subtle"');
  content = content.replace(/: "neutral"/g, ': "subtle"');
  
  // Replace getDelayColor neutral returns
  content = content.replace(/if \([^)]+\) return "neutral"/g, 'if (delay === null || Number.isNaN(delay) || delay === 0) return "subtle"');
  
  // Replace getLogBadgeColor neutral returns
  content = content.replace(/return "neutral";/g, 'return "subtle";');
  content = content.replace(/getLogBadgeColor\(type: string\): "neutral"/g, 'getLogBadgeColor(type: string): "subtle"');
  
  // Overview.tsx unused CardHeader
  if (file.includes('Overview.tsx')) {
    content = content.replace('  CardHeader,\n', '');
  }
  
  // ConfigFileGrid.tsx unused useMemo
  if (file.includes('ConfigFileGrid.tsx')) {
    content = content.replace('import { useMemo } from "react";\n', '');
  }
  
  // Connections.tsx unused MenuItem and missing React
  if (file.includes('Connections.tsx')) {
    content = content.replace('  MenuItem,\n', '');
    if (!content.includes('import React')) {
      content = 'import React, { useEffect, useState, useMemo } from "react";\n' + content.replace('import { useEffect, useState, useMemo } from "react";\n', '');
    }
  }

  // SingboxCoreSection.tsx unused CheckmarkCircleRegular
  if (file.includes('SingboxCoreSection.tsx')) {
    content = content.replace(', CheckmarkCircleRegular', '');
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed common TS errors');
