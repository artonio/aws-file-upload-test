import Parse from 'parse';

export const initParse = () => {
  try {
    const appId = import.meta.env.VITE_PARSE_APP_ID;
    const jsKey = import.meta.env.VITE_PARSE_JS_KEY;
    const masterKey = import.meta.env.VITE_PARSE_MASTER_KEY;
    const serverURL = import.meta.env.VITE_PARSE_SERVER_URL;
    Parse.initialize(appId, jsKey, masterKey);
    Parse.serverURL = serverURL;

    const cloud: typeof Parse.Cloud = Parse.Cloud;
    const usersQuery = new Parse.Query(Parse.User);

    console.log('%c Parse initialized', 'background: #222; color: #bada55');
    return {
      cloud,
      usersQuery
    };

  } catch (error) {
    console.error('Error while initializing Parse:', error);
  }
};