var langs = require('langs');

var short;

module.exports = function() {
    if(short) {
        return short;
    } else {
        short = {};
        let languages = langs.all();
        for (let i = 0; i < languages.length; i++) {
            short[languages[i]['2T'].toUpperCase()] = languages[i].name;
        }
        //console.log(langs.all());
        return short;
    }
}