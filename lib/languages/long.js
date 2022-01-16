var langs = require('langs');

var long;

module.exports = function() {
    if(long) {
        return long;
    } else {
        long = {};
        let languages = langs.all();
        for (let i = 0; i < languages.length; i++) {
            long[languages[i].name.toUpperCase()] = languages[i]['2T']
        }
        //console.log(langs.all());
        return long;
    }
}