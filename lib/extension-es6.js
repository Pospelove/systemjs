/*
 * Extension to detect ES6 and auto-load Traceur or Babel for processing
 */
function es6(loader) {
  loader._extensions.push(es6);

  // good enough ES6 detection regex - format detections not designed to be accurate, but to handle the 99% use case
  var es6RegEx = /(^\s*|[}\);\n]\s*)(import\s+(['"]|(\*\s+as\s+)?[^"'\(\)\n;]+\s+from\s+['"]|\{)|export\s+\*\s+from\s+["']|export\s+(\{|default|function|class|var|const|let|async\s+function))/;

  var traceurRuntimeRegEx = /\$traceurRuntime\s*\./;
  var babelHelpersRegEx = /babelHelpers\s*\./;

  var transpilerNormalized;

  var firstLoad = true;

  var nodeResolver = typeof process != 'undefined' && typeof require != 'undefined' && require.resolve;

  function setConfig(loader, module, nodeModule) {
    loader.meta[module] = {format: 'global'};
    if (nodeResolver && !loader.paths[module])
      loader.paths[module] = require.resolve(nodeModule || module);
  }

  var loaderLocate = loader.locate;
  loader.locate = function(load) {
    var self = this;
    if (firstLoad) {
      if (self.transpiler == 'traceur') {
        setConfig(self, 'traceur', 'traceur/bin/traceur.js');
        loader.meta['traceur'].exports = 'traceur';
        setConfig(self, 'traceur-runtime', 'traceur/bin/traceur-runtime.js');
      }
      else if (self.transpiler == 'babel') {
        setConfig(self, 'babel', 'babel-core/browser.js');
        setConfig(self, 'babel-runtime', 'babel-core/external-helpers.js');
      }
      firstLoad = false;
    }
    return loaderLocate.call(self, load);
  };

  var loaderTranslate = loader.translate;
  loader.translate = function(load) {
    var loader = this;

    return loaderTranslate.call(loader, load)
    .then(function(source) {

      // detect ES6
      if (load.metadata.format == 'es6' || !load.metadata.format && source.match(es6RegEx)) {
        load.metadata.format = 'es6';
        return source;
      }

      if (load.metadata.format == 'register') {
        if (!loader.global.$traceurRuntime && load.source.match(traceurRuntimeRegEx)) {
          return loader['import']('traceur-runtime').then(function() {
            return source;
          });
        }
        if (!loader.global.babelHelpers && load.source.match(babelHelpersRegEx)) {
          return loader['import']('babel/external-helpers').then(function() {
            return source;
          });
        }
      }

      // ensure Traceur doesn't clobber the System global
      if (loader.transpiler == 'traceur')
        return Promise.resolve(transpilerNormalized || (transpilerNormalized = loader.normalize(loader.transpiler)))
        .then(function(transpilerNormalized) {
          if (load.name == transpilerNormalized || load.name == transpilerNormalized + '-runtime')
            return '(function() { var curSystem = System; ' + source + '\nSystem = curSystem; })();';

          return source;
        });

      return source;
    });

  };

}