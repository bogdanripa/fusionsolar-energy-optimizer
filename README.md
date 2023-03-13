# Tesla / Huawei Fusionsolar Energy Optimizer

This genezio app will match the energy that a huawei fusionsolar inverter generates from solar panels to a tesla, located on the same location, so that the tesla does not use more energy than what is being generated by the solar panels

Deploymenmt instruction steps:

1. Copy config/default.json.template to config/default.json
2. Enter your information in the default.json file
    1. There are multiple ways to get a tesla refresh token. I used this one: https://chrome.google.com/webstore/detail/tesla-access-token-genera/kokkedfblmfbngojkeaepekpidghjgag
    2. fusionsolarCredentials should be your user / pass that you use to sign in to https://eu5.fusionsolar.huawei.com/
    3. Once signed in, go to the details page where you see the real-time data, and copy the stationID from the URL. Should be something like: https://region04eu5.fusionsolar.huawei.com/pvmswebsite/assets/build/index.html#/view/station/NE=12345678/overview and you need to get the "NE-12345678" ID and save it in the config file
    4. solarLocation should be the location of your charging point
    5. MONGO_DB_URI is a mongodb connection URI where  we store cached tokens and cookies
3. Create a https://genez.io/ account and install; thye CLI tool: https://docs.genez.io/genezio-documentation/getting-started/install-the-genezio-cli
4. Run "genezio deploy" in the current folder
5. Enjoy!
