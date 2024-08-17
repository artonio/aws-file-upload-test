import { Component, createEffect, createSignal } from 'solid-js';

import Parse from 'parse';

import { parse } from '.';

const App: Component = () => {
  const [file, setFile] = createSignal<File | null>(null);


  const cloud: typeof Parse.Cloud = Parse.Cloud;

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files?.length) {
      setFile(target.files[0]);
    }
  };

  createEffect(() => {
    if (file()) {

      // convert file to buffer
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        const base64String = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        // console.log('Buffer:', base64String);


        // call cloud function
        parse!.cloud.run('uploadFileToS3', { file: base64String, fileName: file()?.name, fileType: file()?.type })
        .then((result) => {
          console.log('Cloud function result:', result);
        }).catch((error) => {
          console.error('Cloud function error:', error);
        });
      };
      reader.readAsArrayBuffer(file()!);
    }
  });

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {file() && <p>File name: {file()?.name}</p>}
    </div>
  );
};

export default App;
