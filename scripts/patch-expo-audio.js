const fs = require('fs');
const path = require('path');

const candidateDirs = [
  path.resolve(__dirname, '../node_modules/expo-audio/build'),
  path.resolve(__dirname, '../apps/mobile/node_modules/expo-audio/build'),
  path.resolve(process.cwd(), 'node_modules/expo-audio/build'),
  path.resolve(process.cwd(), '../../node_modules/expo-audio/build'),
];

try {
  const resolvedPkg = require.resolve('expo-audio/package.json', {
    paths: [process.cwd(), __dirname, path.resolve(__dirname, '../apps/mobile')],
  });
  candidateDirs.unshift(path.resolve(path.dirname(resolvedPkg), 'build'));
} catch {}

const seen = new Set();

candidateDirs.forEach((expoAudioBuildDir) => {
  if (seen.has(expoAudioBuildDir)) return;
  seen.add(expoAudioBuildDir);

  if (fs.existsSync(expoAudioBuildDir)) {
    const content = "export * from './AudioStream.js';\n";
    const typesContent = "export * from './AudioStream';\n";
    const webContent = "export * from './AudioStream.web.js';\n";

    const targets = [
      { file: 'AudioStream.android.js', content },
      { file: 'AudioStream.native.js', content },
      { file: 'AudioStream.android.d.ts', content: typesContent },
      { file: 'AudioStream.native.d.ts', content: typesContent },
      { file: 'AudioStream.web.web.js', content: webContent },
    ];

    targets.forEach(({ file, content: c }) => {
      const targetPath = path.join(expoAudioBuildDir, file);
      if (!fs.existsSync(targetPath)) {
        try {
          fs.writeFileSync(targetPath, c, 'utf8');
        } catch {}
      }
    });

    // Patch ExpoAudio.web.js if it contains './AudioStream.web'
    const webJsPath = path.join(expoAudioBuildDir, 'ExpoAudio.web.js');
    if (fs.existsSync(webJsPath)) {
      try {
        let code = fs.readFileSync(webJsPath, 'utf8');
        if (code.includes("'./AudioStream.web'")) {
          code = code.replace("'./AudioStream.web'", "'./AudioStream'");
          fs.writeFileSync(webJsPath, code, 'utf8');
        }
      } catch {}
    }

    // Patch ExpoAudio.web.d.ts if it contains './AudioStream.web'
    const webDtsPath = path.join(expoAudioBuildDir, 'ExpoAudio.web.d.ts');
    if (fs.existsSync(webDtsPath)) {
      try {
        let code = fs.readFileSync(webDtsPath, 'utf8');
        if (code.includes("'./AudioStream.web'")) {
          code = code.replace("'./AudioStream.web'", "'./AudioStream'");
          fs.writeFileSync(webDtsPath, code, 'utf8');
        }
      } catch {}
    }
  }
});
