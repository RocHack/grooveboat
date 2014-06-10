// Ractive-style Router.
// with help from https://github.com/anthonyshort/static-router/

// Match named param parts and splatted parts of route strings.
var optionalParam = /\((.*?)\)/g;
var namedParam    = /(\(\?)?:(\w+)/g;
var splatParam    = /\*/g;
var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

// leading and trailing slashes
var rootStripper = /^\/+|\/+$/g;

// Makes sure all urls have a leading slash and no trailing slash
// Used to normalize all urls so we always know the format
function normalizeUrl(url) {
	return ('/' + url).replace(rootStripper, '/');
}

// Route object for matching URLs and dispatching a callback
function Route(route, controller, router) {
	this.controller = controller;
	this.router = router;
	var names = this.names = ['path'];
	route = route.replace(escapeRegExp, '\\$&')
		.replace(optionalParam, '(?:$1)?')
		.replace(namedParam, function(match, optional, name) {
			names.push(name);
			return optional ? match : '([^\/]+)';
		})
		.replace(splatParam, function() {
			names.push('splat');
			return '(.*?)';
		});
	this.regexp = new RegExp('^' + route + '$');
}

Route.prototype.handle = function(path) {
	var matches = this.regexp.exec(path);
	if (!matches) return;
	var options = Object.create(this.router.routeOptions);
	for (var i = 0; i < matches.length; i++) {
		options[this.names[i]] = matches[i];
	}
	return new this.controller(options);
};

module.exports = {
	template: [],

	init: function(options) {
		this.observe(this.observers);

		this.root = options.root ? normalizeUrl(options.root) : '/';
		this.routeOptions = options.options || {};
		this.routeOptions._router = this;
		this.routes = {};
		if (options.routes) for (var route in options.routes) {
			this.route(route, options.routes[route]);
		}

		var updatePath = this.updatePath.bind(this);
		var onClick = this.onClick.bind(this);
		window.addEventListener('popstate', updatePath, false);
		window.addEventListener('click', onClick, false);

		this.on('teardown', function() {
			window.removeEventListener('popstate', updatePath, false);
			window.removeEventListener('click', onClick, false);
		});
	},

	observers: {
		page: function(newPage, oldPage) {
			if (oldPage) oldPage.teardown();
		},
		relativePath: function(path) {
			var page;
			try {
				page = this.handle(path);
			} catch(e) {
				console.error(e.stack || e);
			}
			this.set('page', page);
		}
	},

	computed: {
		relativePath: function() {
			var path = this.get('path');
			// strip root
			if (path.indexOf(this.root) === 0) {
				path = path.substr(this.root.length);
			}
			return normalizeUrl(path);
		}
	},

	updatePath: function() {
		this.set('path', location.pathname);
	},

	// handle click events on the page
	onClick: function(e) {
		if (e.target.nodeName == 'A' && !e.ctrlKey && e.target.href &&
			e.target.href.indexOf(location.origin) === 0) {
			// intercept the click
			e.preventDefault();
			this.navigate(e.target.href.substr(location.origin.length));
		}
	},

	// trigger navigation to a given path
	navigate: function(path) {
		if (!path) path = '/';
		this.set('path', path);
		var page = this.get('page');
		var state = true;
		var title = page ? page.title || page.get('title') : window.title;
		window.history.pushState(state, title, path);
	},

	// execute a route for a given path
	handle: function (path) {
		for (var key in this.routes) {
			var page = this.routes[key].handle(path, this);
			if (page) return page;
		}
	},

	// register a route
	route: function(route, callback) {
		this.routes[route] = new Route(route, callback, this);
	},

	// handle current route
	go: function() {
		this.updatePath();
	}
};
