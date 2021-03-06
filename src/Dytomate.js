define([ "reqwest", "Editor", "ImageChanger" ], function(reqwest, Editor, ImageChanger) {
	function Dytomate(container, options) {
		options = options || {};
		
		this.container = container;
		
		this.options = this.mergeOptions({
			dataAttribute: "dytomate",
			
			doubleClickDelay: 250,
			
			saveUrl: "/api/dytomate/save",
			uploadUrl: "/api/dytomate/upload",
			
			editorPadding: 8,
			editorBorderWidth: 1,
			editorBorderColor: "#666",
			editorShadowSize: 10,
			editorShadowColor: "#333",
			editorOverlayColor: "rgba(255, 255, 255, .75)",
			editorToolbarOffsetX: 0,
			editorToolbarOffsetY: 8,
			editorToolbarButtonSize: 24,
			editorToolbarButtonSpacing: 4,
			editorToolbarButtonColor: "#fff",
			editorToolbarButtonHoverColor: "#BDF7FF",
			editorToolbarButtonShadowSize: 0,
			editorToolbarButtonShadowHoverSize: 5,
			editorToolbarButtonShadowColor: "#004A54",
			editorToolbarButtonBorderWidth: 1,
			editorToolbarButtonBorderColor: "#666"
		}, options);
		
		this.saveQueue = [];
		this.listeners = {};
		
		this.editor = null;
		this.currentlySaving = false;
		this.enabled = false;
		
		this.enable();
	}
	
	Dytomate.prototype.enable = function() {
		if (!this.enabled) {
			this.attachListeners();
			
			this.enabled = true;
		}
		
		return this;
	};
	
	Dytomate.prototype.disable = function() {
		if (this.enabled) {
			if (this.editor) {
				this.closeTextElementEdit();
			}
			
			this.detachListeners();
			
			this.enabled = false;
		}
		
		return this;
	};
	
	Dytomate.prototype.edit = function(element) {
		var event = new CustomEvent("dytomatePreEdit", {
			detail: "dytomate",
			bubbles: true,
			cancelable: true
		});
		
		element.dispatchEvent(event);
		
		if (element.tagName.toLowerCase() === "img") {
			return this.editImageElement(element);
		}
		else {
			return this.editTextElement(element);
		}
	};
	
	Dytomate.prototype.editImageElement = function(element) {
		var imageChanger = new ImageChanger(this, element);
		
		imageChanger.enable();
		
		return imageChanger;
	};
	
	Dytomate.prototype.editTextElement = function(element) {
		var mouseDownInElement = false;
		
		this.editor = new Editor(this, element);
		this.editor.enable();
		
		element.addEventListener("mousedown", this.listeners.elementMouseDown = function(event) {
			mouseDownInElement = true;
		});
		
		window.addEventListener("mouseup", this.listeners.windowMouseUp = function(event) {
			var element = event.target;
			
			if (mouseDownInElement) {
				mouseDownInElement = false;
				
				return;
			}
			
			while (element && this.container.contains(element)) {
				if (
					element.classList.contains("dytomate-editor-command-button") ||
					element.classList.contains("dytomate-editor-textarea") ||
					this.getElementDytomateAttribute(element, "in-edit") === "true"
				) {
					mouseDownInElement = false;
					
					return;
				}
				
				element = element.parentNode;
			}
			
			this.closeTextElementEdit();
		}.bind(this));
		
		return this.editor;
	};
	
	Dytomate.prototype.closeTextElementEdit = function() {
		if (this.editor) {
			this.editor.scribe.el.removeEventListener("mousedown", this.listeners.elementMouseDown);
			delete this.listeners.elementMouseDown;
			
			window.removeEventListener("mouseup", this.listeners.windowMouseUp);
			delete this.listeners.windowMouseUp;
			
			this.editor.disable();
			this.editor = null;
		}
		
		return this;
	};
	
	Dytomate.prototype.save = function(key, value, attributes, isFile, onDone, fromQueue) {
		if (!fromQueue && this.saveQueue.length > 0) {
			this.saveQueue.push({
				key: key,
				value: value,
				attributes: attributes,
				isFile: isFile,
				onDone: onDone
			});
		}
		else {
			var url = isFile ? this.options.uploadUrl : this.options.saveUrl;
			
			var finalize = function(response) {
				this.currentlySaving = false;
				
				if (this.saveQueue.length > 0) {
					var nextSave = this.saveQueue.shift();
					
					this.save(
						nextSave.key,
						nextSave.value,
						nextSave.attributes,
						nextSave.isFile,
						nextSave.onDone,
						true
					);
				}
				
				if (onDone) {
					onDone(response);
				}
			}.bind(this);
			
			var onSuccess = function(response) {
				finalize(response);
			};
			
			var onError = function() {
				alert("Couldn't save `" + key + "`.");
				
				finalize();
			};
			
			if (typeof key === "object") {
				key = this.getElementDytomateAttribute(key);
			}
			
			this.currentlySaving = true;
			
			reqwest({
				url: url,
				method: "post",
				data: { key: key, value: value, attributes: attributes },
				error: function(error) {
					onError();
				},
				success: function(response) {
					try {
						response = JSON.parse(response);
					}
					catch (e) {
						response = false;
					}
					
					if (typeof response === "object" && response.success) {
						onSuccess(response);
					}
					else {
						onError();
					}
				}
			});
		}
		
		return this;
	};
	
	Dytomate.prototype.saveText = function(key, value, attributes, onDone) {
		return this.save(key, value, attributes, false, onDone, false);
	};
	
	Dytomate.prototype.saveFile = function(key, file, attributes, onDone) {
		var reader = new FileReader();
		
		reader.onload = function(event) {
			var blob = event.target.result.split(",")[1];
			
			this.save(key, { name: file.name, blob: blob }, attributes, true, onDone, false);
		}.bind(this);
		
		reader.readAsDataURL(file);
		
		return this;
	};
	
	Dytomate.prototype.attachListeners = function() {
		this.listeners.elementClickListenerElements = [];
		this.listeners.elementClick = function(event) {
			if (event.detail !== "dytomate") {
				var element = event.target;
				var targetElement = event.target;
				
				while (element && this.container.contains(element)) {
					if (this.getElementDytomateAttribute(element) !== null) {
						if (
							this.getElementDytomateAttribute(element, "in-edit") !== "true" &&
							this.getElementDytomateAttribute(element, "ro") === null
						) {
							event.preventDefault();
							event.stopPropagation();
							
							this.handleDoubleClick(element, targetElement);
						}
						
						break;
					}
					else {
						element = element.parentNode;
					}
				}
			}
		}.bind(this);
		
		var elements = document.querySelectorAll("[data-" + this.options.dataAttribute + "]");
		
		window.onbeforeunload = function(event) {
			if (this.saveQueue.length > 0 || this.currentlySaving) {
				return "Changes are still being saved. Are you sure you want to navigate away ( changes will be lost )?";
			}
		}.bind(this);
		
		for (var i = 0; i < elements.length; i++) {
			this.listeners.elementClickListenerElements.push(elements[i]);
			elements[i].addEventListener("click", this.listeners.elementClick);
		}
		
		this.container.addEventListener("click", this.listeners.elementClick);
		
		return this;
	};
	
	Dytomate.prototype.detachListeners = function() {
		delete window.onbeforeunload;
		
		for (var i = 0; i < this.listeners.elementClickListenerElements.length; i++) {
			this.listeners.elementClickListenerElements[i].removeEventListener("click", this.listeners.elementClick);
		}
		this.listeners.elementClickListenerElements = [];
		
		this.container.removeEventListener("click", this.listeners.elementClick);
		
		delete this.listeners.elementClick;
		
		return this;
	};
	
	Dytomate.prototype.handleDoubleClick = function(element, targetElement) {
		var timer = this.getElementDytomateAttribute(element, "double-click-timer");
		
		timer = timer ? parseInt(timer, 10) : false;
		
		if (timer) {
			clearTimeout(timer);
			this.removeElementDytomateAttribute(element, "double-click-timer");
			
			this.edit(element);
		}
		else {
			timer = setTimeout(function() {
				var event = new CustomEvent("click", {
					detail: "dytomate",
					bubbles: true,
					cancelable: true
				});
				
				this.removeElementDytomateAttribute(element, "double-click-timer");
				
				targetElement.dispatchEvent(event);
			}.bind(this), this.options.doubleClickDelay);
			
			this.setElementDytomateAttribute(element, "double-click-timer", timer);
		}
		
		return this;
	};
	
	Dytomate.prototype.getElementDytomateAttributeName = function(name) {
		if (name) {
			name = "-" + name;
		}
		else {
			name = "";
		}
		
		return "data-" + this.options.dataAttribute + name;
	};
	
	Dytomate.prototype.getElementDytomateAttribute = function(element, name) {
		name = this.getElementDytomateAttributeName(name);
		
		return element.getAttribute(name);
	};
	
	Dytomate.prototype.setElementDytomateAttribute = function(element, name, value) {
		name = this.getElementDytomateAttributeName(name);
		
		element.setAttribute(name, value);
		
		return this;
	};
	
	Dytomate.prototype.removeElementDytomateAttribute = function(element, name) {
		name = this.getElementDytomateAttributeName(name);
		
		element.removeAttribute(name);
		
		return this;
	};
	
	Dytomate.prototype.mergeOptions = function(defaults, overrides) {
		for (var i in overrides) {
			if (overrides.hasOwnProperty(i)) {
				defaults[i] = overrides[i];
			}
		}
		
		return defaults;
	};
	
	return Dytomate;
});