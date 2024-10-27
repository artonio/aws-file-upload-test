import { Component, createEffect, createSignal } from 'solid-js';
import axios from 'axios';
import Parse from 'parse';
import { Uploader } from './s3/Uploader';

import { parse } from '.';

const App: Component = () => {
  const [file, setFile] = createSignal<File | null>(null);
  const [uploader, setUploader] = createSignal<Uploader | null>(null);
  const p = parse;

  const cloud: typeof Parse.Cloud = Parse.Cloud;

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files?.length) {
      setFile(target.files[0]);
    }
  };

  createEffect(() => {
    if (file()) {
      let percentage: any = 0;

      const videoUploaderOptions = {
        fileName: file()?.name || 'foo.mp4',
        file: file()!,
      }
      const awsUploader = new Uploader(videoUploaderOptions);
      setUploader(awsUploader);

      awsUploader
        .onProgress(({ percentage: newPercentage }: { percentage: number }) => {
          // to avoid the same percentage to be logged twice
          if (newPercentage !== percentage) {
            percentage = newPercentage
            console.log(`${percentage}%`)
          }
        })
        .onError((error: any) => {
          setFile(null)
          console.error(error)
        })

        uploader()!.start()
    }
  });

  return (
    <div>
      <div>
        <input type="file" onChange={handleFileChange} />
        {file() && <p>File name: {file()?.name}</p>}
      </div>
      <div>
        <button onClick={() => {
          axios.get('https://zoomy.b4a.io/helloAnton', {})
            .then((response) => {
              console.log('Response:', response);
            });
        }}>Test</button>
      </div>
    </div>
  );
};

export default App;
